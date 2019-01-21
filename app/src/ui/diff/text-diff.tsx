import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { clipboard } from 'electron'
import { Editor, LineHandle } from 'codemirror'
import { Disposable } from 'event-kit'

import { fatalError } from '../../lib/fatal-error'

import {
  DiffHunk,
  DiffLineType,
  DiffSelection,
  DiffLine,
} from '../../models/diff'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'

import { Octicon, OcticonSymbol } from '../octicons'

import { IEditorConfigurationExtra } from './editor-configuration-extra'
import { DiffSyntaxMode, IDiffSyntaxModeSpec } from './diff-syntax-mode'
import { CodeMirrorHost } from './code-mirror-host'
import { DiffLineGutter } from './diff-line-gutter'
import {
  diffLineForIndex,
  diffHunkForIndex,
  findInteractiveDiffRange,
  lineNumberForDiffLine,
} from './diff-explorer'
import { RangeSelectionSizePixels } from './edge-detection'

import { ISelectionStrategy } from './selection/selection-strategy'
import { RangeSelection } from './selection/range-selection-strategy'
import { DragDropSelection } from './selection/drag-drop-selection-strategy'

import {
  getLineFilters,
  getFileContents,
  highlightContents,
} from './syntax-highlighting'
import { relativeChanges } from './changed-range'
import { Repository } from '../../models/repository'
import memoizeOne from 'memoize-one'
import { selectedLineClass, hoverCssClass } from './selection/selection'

/** The longest line for which we'd try to calculate a line diff. */
const MaxIntraLineDiffStringLength = 4096

// This is a custom version of the no-newline octicon that's exactly as
// tall as it needs to be (8px) which helps with aligning it on the line.
const narrowNoNewlineSymbol = new OcticonSymbol(
  16,
  8,
  'm 16,1 0,3 c 0,0.55 -0.45,1 -1,1 l -3,0 0,2 -3,-3 3,-3 0,2 2,0 0,-2 2,0 z M 8,4 C 8,6.2 6.2,8 4,8 1.8,8 0,6.2 0,4 0,1.8 1.8,0 4,0 6.2,0 8,1.8 8,4 Z M 1.5,5.66 5.66,1.5 C 5.18,1.19 4.61,1 4,1 2.34,1 1,2.34 1,4 1,4.61 1.19,5.17 1.5,5.66 Z M 7,4 C 7,3.39 6.81,2.83 6.5,2.34 L 2.34,6.5 C 2.82,6.81 3.39,7 4,7 5.66,7 7,5.66 7,4 Z'
)

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

/**
 * Checks to see if any key parameters in the props object that are used
 * when performing highlighting has changed. This is used to determine
 * whether highlighting should abort in between asynchronous operations
 * due to some factor (like which file is currently selected) have changed
 * and thus rendering the in-flight highlighting data useless.
 */
function highlightParametersEqual(
  newProps: ITextDiffProps,
  prevProps: ITextDiffProps
) {
  if (newProps === prevProps) {
    return true
  }

  return (
    newProps.file.id === prevProps.file.id && newProps.text === prevProps.text
  )
}

interface ITextDiffProps {
  readonly repository: Repository
  readonly file: ChangedFile
  readonly readOnly: boolean
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void
  readonly text: string
  readonly hunks: ReadonlyArray<DiffHunk>
}

const defaultEditorOptions: IEditorConfigurationExtra = {
  lineNumbers: false,
  readOnly: true,
  showCursorWhenSelecting: false,
  cursorBlinkRate: -1,
  lineWrapping: true,
  mode: { name: DiffSyntaxMode.ModeName },
  // Make sure CodeMirror doesn't capture Tab (and Shift-Tab) and thus destroy tab navigation
  extraKeys: { Tab: false, 'Shift-Tab': false },
  scrollbarStyle: __DARWIN__ ? 'simple' : 'native',
  styleSelectedText: true,
  lineSeparator: '\n',
  specialChars: /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff]/,
  gutters: ['diff-gutter'],
}

export class TextDiff extends React.Component<ITextDiffProps, {}> {
  private codeMirror: Editor | null = null
  private hunkHighlightRange: { start: number; end: number } | null = null

  private getFormattedText = memoizeOne((text: string) => {
    // If the text looks like it could have been formatted using Windows
    // line endings (\r\n) we need to massage it a bit before we hand it
    // off to CodeMirror. That's because CodeMirror has two ways of splitting
    // lines, one is the built in which splits on \n, \r\n and \r. The last
    // one is important because that will match carriage return characters
    // inside a diff line. The other way is when consumers supply the
    // lineSeparator option. That option only takes a string meaning we can
    // either make it split on '\r\n', '\n' or '\r' but not what we would like
    // to do, namely '\r?\n'. We want to keep CR characters inside of a diff
    // line so that we can mark them using the specialChars attribute so
    // we convert all \r\n to \n and remove any trailing \r character.
    if (text.indexOf('\r') === -1) {
      return text
    }

    // Capture the \r if followed by (positive lookahead) a \n or
    // the end of the string. Note that this does not capture the \n.
    return text.replace(/\r(?=\n|$)/g, '')
  })


  /**
   * A mapping from CodeMirror line handles to disposables which, when disposed
   * cleans up any line gutter components and events associated with that line.
   * See renderLine for more information.
   */
  private readonly lineCleanup = new Map<any, Disposable>()

  /**
   *  a local cache of gutter elements, keyed by the row in the diff
   */
  private cachedGutterElements = new Map<number, DiffLineGutter>()

  /**
   * Maintain the current state of the user interacting with the diff gutter
   */
  private selection: ISelectionStrategy | null = null

  private async initDiffSyntaxMode() {
    const cm = this.codeMirror
    const file = this.props.file
    const hunks = this.props.hunks
    const repo = this.props.repository

    if (!cm) {
      return
    }

    // Store the current props to that we can see if anything
    // changes from underneath us as we're making asynchronous
    // operations that makes our data stale or useless.
    const propsSnapshot = this.props

    const lineFilters = getLineFilters(hunks)
    const contents = await getFileContents(repo, file, lineFilters)

    if (!highlightParametersEqual(this.props, propsSnapshot)) {
      return
    }

    const tsOpt = cm.getOption('tabSize')
    const tabSize = typeof tsOpt === 'number' ? tsOpt : 4

    const tokens = await highlightContents(contents, tabSize, lineFilters)

    if (!highlightParametersEqual(this.props, propsSnapshot)) {
      return
    }

    const spec: IDiffSyntaxModeSpec = {
      name: DiffSyntaxMode.ModeName,
      hunks: this.props.hunks,
      oldTokens: tokens.oldTokens,
      newTokens: tokens.newTokens,
    }

    cm.setOption('mode', spec)
  }

  private dispose() {
    this.codeMirror = null

    this.lineCleanup.forEach(disposable => disposable.dispose())
    this.lineCleanup.clear()

    document.removeEventListener('mouseup', this.onDocumentMouseUp)
  }

  private updateRangeHoverState = (
    start: number,
    end: number,
    show: boolean
  ) => {
    for (let i = start; i <= end; i++) {
      this.hoverLine(i, show)
    }
  }

  private hoverLine = (row: number, include: boolean) => {
    const element = this.cachedGutterElements.get(row)

    // element may not be drawn by the editor, so updating it isn't necessary
    if (element) {
      element.setHover(include)
    }
  }

  /**
   * start a selection gesture based on the current interation
   */
  private startSelection = (
    file: WorkingDirectoryFileChange,
    hunks: ReadonlyArray<DiffHunk>,
    index: number,
    isRangeSelection: boolean
  ) => {
    const snapshot = file.selection
    const selected = snapshot.isSelected(index)
    const desiredSelection = !selected

    if (isRangeSelection) {
      const range = findInteractiveDiffRange(hunks, index)
      if (!range) {
        console.error('unable to find range for given line in diff')
        return
      }

      this.selection = new RangeSelection(
        range.start,
        range.end,
        desiredSelection,
        snapshot
      )
    } else {
      this.selection = new DragDropSelection(index, desiredSelection, snapshot)
    }

    this.selection.paint(this.cachedGutterElements)
    document.addEventListener('mouseup', this.onDocumentMouseUp, { once: true })
  }

  private cancelSelection = () => {
    this.selection = null
  }

  private onDocumentMouseUp = (ev: MouseEvent) => {
    ev.preventDefault()

    if (this.codeMirror === null || this.selection === null) {
      return this.cancelSelection()
    }

    // A range selection is when the user clicks on the "hunk handle"
    // which is a hit area spanning 20 or so pixels on either side of
    // the gutter border, extending into the text area. We capture the
    // mouse down event on that hunk handle and for the mouse up event
    // we need to make sure the user is still within that hunk handle
    // section and in the correct range.
    if (this.selection instanceof RangeSelection) {
      // Is the pointer over something that might be a hunk handle?
      if (ev.target === null || !(ev.target instanceof HTMLElement)) {
        return this.cancelSelection()
      }

      // Is it a hunk handle?
      if (!ev.target.classList.contains('hunk-handle')) {
        return this.cancelSelection()
      }

      const { start, end } = this.selection
      const lineNumber = this.codeMirror.lineAtHeight(ev.y)

      // Is the pointer over the same range (i.e hunk) that the
      // selection was originally started from?
      if (lineNumber < start || lineNumber > end) {
        return this.cancelSelection()
      }
    }

    this.endSelection()
  }

  /**
   * complete the selection gesture and apply the change to the diff
   */
  private endSelection = () => {
    if (!this.props.onIncludeChanged || !this.selection) {
      return
    }

    this.props.onIncludeChanged(this.selection.done())

    // operation is completed, clean this up
    this.selection = null
  }

  private onGutterMouseDown = (
    index: number,
    hunks: ReadonlyArray<DiffHunk>,
    isRangeSelection: boolean
  ) => {
    if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
      fatalError(
        'must not start selection when selected file is not a WorkingDirectoryFileChange'
      )
      return
    }

    if (isRangeSelection) {
      const hunk = diffHunkForIndex(hunks, index)
      if (!hunk) {
        console.error('unable to find hunk for given line in diff')
      }
    }
    this.startSelection(this.props.file, hunks, index, isRangeSelection)
  }

  private onGutterMouseMove = (index: number) => {
    if (!this.selection) {
      return
    }

    this.selection.update(index)
    this.selection.paint(this.cachedGutterElements)
  }

  private onDiffTextMouseMove = (
    ev: MouseEvent,
    hunks: ReadonlyArray<DiffHunk>,
    index: number
  ) => {
    const isActive = this.isMouseCursorNearGutter(ev)
    if (isActive === null) {
      return
    }

    const diffLine = diffLineForIndex(hunks, index)
    if (!diffLine) {
      return
    }

    if (!diffLine.isIncludeableLine()) {
      return
    }

    const range = findInteractiveDiffRange(hunks, index)
    if (!range) {
      console.error('unable to find range for given index in diff')
      return
    }

    this.updateRangeHoverState(range.start, range.end, isActive)
  }

  private onDiffTextMouseDown = (
    ev: MouseEvent,
    hunks: ReadonlyArray<DiffHunk>,
    index: number
  ) => {
    const isActive = this.isMouseCursorNearGutter(ev)

    if (isActive) {
      // this line is important because it prevents the codemirror editor
      // from handling the event and resetting the scroll position.
      // it doesn't do this when you click on elements in the gutter,
      // which is an amazing joke to have placed upon me right now
      ev.preventDefault()

      if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
        fatalError(
          'must not start selection when selected file is not a WorkingDirectoryFileChange'
        )
        return
      }

      this.startSelection(this.props.file, hunks, index, true)
    }
  }

  private onDiffTextMouseLeave = (
    ev: MouseEvent,
    hunks: ReadonlyArray<DiffHunk>,
    index: number
  ) => {
    const range = findInteractiveDiffRange(hunks, index)
    if (!range) {
      console.error('unable to find range for given index in diff')
      return
    }

    this.updateRangeHoverState(range.start, range.end, false)
  }

  private isMouseCursorNearGutter = (ev: MouseEvent): boolean | null => {
    const width = 125

    if (!width) {
      // should fail earlier than this with a helpful error message
      return null
    }

    const deltaX = ev.layerX - width
    return deltaX >= 0 && deltaX <= RangeSelectionSizePixels
  }

  private isSelectionEnabled = () => {
    return this.selection == null
  }

  private restoreScrollPosition(cm: Editor) {
    const scrollPosition = this.scrollPositionToRestore
    if (cm && scrollPosition) {
      cm.scrollTo(scrollPosition.left, scrollPosition.top)
    }
  }

  private renderLine = (instance: any, line: any, element: HTMLElement) => {
    // TODO!
    if (1 / 1 !== Infinity) {
      return
    }

    const existingLineDisposable = this.lineCleanup.get(line)

    // If we can find the line in our cleanup list that means the line is
    // being re-rendered. Agains, CodeMirror doesn't fire the 'delete' event
    // when this happens.
    if (existingLineDisposable) {
      existingLineDisposable.dispose()
      this.lineCleanup.delete(line)
    }

    const index = instance.getLineNumber(line) as number

    const diffLine = diffLineForIndex(this.props.hunks, index)
    if (diffLine) {
      const diffLineElement = element.children[0] as HTMLSpanElement

      let noNewlineReactContainer: HTMLSpanElement | null = null

      if (diffLine.noTrailingNewLine) {
        noNewlineReactContainer = document.createElement('span')
        noNewlineReactContainer.setAttribute(
          'title',
          'No newline at end of file'
        )
        ReactDOM.render(
          <Octicon symbol={narrowNoNewlineSymbol} className="no-newline" />,
          noNewlineReactContainer
        )
        diffLineElement.appendChild(noNewlineReactContainer)
      }

      const gutterReactContainer = document.createElement('span')

      let isIncluded = false
      if (this.props.file instanceof WorkingDirectoryFileChange) {
        isIncluded = this.props.file.selection.isSelected(index)
      }

      const cache = this.cachedGutterElements

      const hunks = this.props.hunks

      ReactDOM.render(
        <DiffLineGutter
          line={diffLine}
          isIncluded={isIncluded}
          index={index}
          readOnly={this.props.readOnly}
          hunks={hunks}
          updateRangeHoverState={this.updateRangeHoverState}
          isSelectionEnabled={this.isSelectionEnabled}
          onMouseDown={this.onGutterMouseDown}
          onMouseMove={this.onGutterMouseMove}
        />,
        gutterReactContainer,
        function(this: DiffLineGutter) {
          if (this !== undefined) {
            cache.set(index, this)
          }
        }
      )

      const onMouseMoveLine: (ev: MouseEvent) => void = ev => {
        this.onDiffTextMouseMove(ev, hunks, index)
      }

      const onMouseDownLine: (ev: MouseEvent) => void = ev => {
        this.onDiffTextMouseDown(ev, hunks, index)
      }

      const onMouseLeaveLine: (ev: MouseEvent) => void = ev => {
        this.onDiffTextMouseLeave(ev, hunks, index)
      }

      if (!this.props.readOnly) {
        diffLineElement.addEventListener('mousemove', onMouseMoveLine)
        diffLineElement.addEventListener('mousedown', onMouseDownLine)
        diffLineElement.addEventListener('mouseleave', onMouseLeaveLine)
      }

      element.insertBefore(gutterReactContainer, diffLineElement)

      // Hack(ish?). In order to be a real good citizen we need to unsubscribe from
      // the line delete event once we've been called once or the component has been
      // unmounted. In the latter case it's _probably_ not strictly necessary since
      // the only thing gc rooted by the event should be isolated and eligble for
      // collection. But let's be extra cautious I guess.
      //
      // The only way to unsubscribe is to pass the exact same function given to the
      // 'on' function to the 'off' so we need a reference to ourselves, basically.
      let deleteHandler: () => void // eslint-disable-line prefer-const

      // Since we manually render a react component we have to take care of unmounting
      // it or else we'll leak memory. This disposable will unmount the component.
      //
      // See https://facebook.github.io/react/blog/2015/10/01/react-render-and-top-level-api.html
      const gutterCleanup = new Disposable(() => {
        this.cachedGutterElements.delete(index)

        ReactDOM.unmountComponentAtNode(gutterReactContainer)

        if (noNewlineReactContainer) {
          ReactDOM.unmountComponentAtNode(noNewlineReactContainer)
        }

        if (!this.props.readOnly) {
          diffLineElement.removeEventListener('mousemove', onMouseMoveLine)
          diffLineElement.removeEventListener('mousedown', onMouseDownLine)
          diffLineElement.removeEventListener('mouseleave', onMouseLeaveLine)
        }

        line.off('delete', deleteHandler)
      })

      // Add the cleanup disposable to our list of disposables so that we clean up when
      // this component is unmounted or when the line is re-rendered. When either of that
      // happens the line 'delete' event doesn't  fire.
      this.lineCleanup.set(line, gutterCleanup)

      // If the line delete event fires we dispose of the disposable (disposing is
      // idempotent)
      deleteHandler = () => {
        const disp = this.lineCleanup.get(line)
        if (disp) {
          this.lineCleanup.delete(line)
          disp.dispose()
        }
      }
      line.on('delete', deleteHandler)
    }
  }

  private onGutterClick = (
    cm: Editor,
    line: number,
    gutter: string,
    clickEvent: Event
  ) => {
    console.log(`${gutter} clicked on line ${line}`)
    const { file } = this.props

    if (file instanceof WorkingDirectoryFileChange) {
      if (this.props.onIncludeChanged) {
        this.props.onIncludeChanged(
          file.selection.withToggleLineSelection(line)
        )
      }
    }
  }

  private getAndStoreCodeMirrorInstance = (cmh: CodeMirrorHost | null) => {
    const newEditor = cmh === null ? null : cmh.getEditor()
    if (newEditor === null && this.codeMirror !== null) {
      this.codeMirror.off('gutterClick', this.onGutterClick)
    }

    this.codeMirror = newEditor

    if (this.codeMirror !== null) {
      this.codeMirror.on('gutterClick', this.onGutterClick)
    }
  }

  private onCopy = (editor: Editor, event: Event) => {
    event.preventDefault()

    // Remove the diff line markers from the copied text. The beginning of the
    // selection might start within a line, in which case we don't have to trim
    // the diff type marker. But for selections that span multiple lines, we'll
    // trim it.
    const doc = editor.getDoc()
    const lines = doc.getSelections()
    const selectionRanges = doc.listSelections()
    const lineContent: Array<string> = []

    for (let i = 0; i < lines.length; i++) {
      const range = selectionRanges[i]
      const content = lines[i]
      const contentLines = content.split('\n')
      for (const [i, line] of contentLines.entries()) {
        if (i === 0 && range.head.ch > 0) {
          lineContent.push(line)
        } else {
          lineContent.push(line.substr(1))
        }
      }

      const textWithoutMarkers = lineContent.join('\n')
      clipboard.writeText(textWithoutMarkers)
    }
  }

  private markIntraLineChanges(
    codeMirror: Editor,
    hunks: ReadonlyArray<DiffHunk>
  ) {
    for (const hunk of hunks) {
      const additions = hunk.lines.filter(l => l.type === DiffLineType.Add)
      const deletions = hunk.lines.filter(l => l.type === DiffLineType.Delete)
      if (additions.length !== deletions.length) {
        continue
      }

      for (let i = 0; i < additions.length; i++) {
        const addLine = additions[i]
        const deleteLine = deletions[i]
        if (
          addLine.text.length > MaxIntraLineDiffStringLength ||
          deleteLine.text.length > MaxIntraLineDiffStringLength
        ) {
          continue
        }

        const changeRanges = relativeChanges(
          addLine.content,
          deleteLine.content
        )
        const addRange = changeRanges.stringARange
        if (addRange.length > 0) {
          const addLineNumber = lineNumberForDiffLine(addLine, hunks)
          if (addLineNumber > -1) {
            const addFrom = {
              line: addLineNumber,
              ch: addRange.location + 1,
            }
            const addTo = {
              line: addLineNumber,
              ch: addRange.location + addRange.length + 1,
            }
            codeMirror
              .getDoc()
              .markText(addFrom, addTo, { className: 'cm-diff-add-inner' })
          }
        }

        const deleteRange = changeRanges.stringBRange
        if (deleteRange.length > 0) {
          const deleteLineNumber = lineNumberForDiffLine(deleteLine, hunks)
          if (deleteLineNumber > -1) {
            const deleteFrom = {
              line: deleteLineNumber,
              ch: deleteRange.location + 1,
            }
            const deleteTo = {
              line: deleteLineNumber,
              ch: deleteRange.location + deleteRange.length + 1,
            }
            codeMirror.getDoc().markText(deleteFrom, deleteTo, {
              className: 'cm-diff-delete-inner',
            })
          }
        }
      }
    }
  }

  private onChanges = (cm: Editor) => {

    this.markIntraLineChanges(cm, this.props.hunks)
  }

  private onViewportChange = (
    cm: CodeMirror.Editor,
    from: number,
    to: number
  ) => {
    const doc = cm.getDoc()

    cm.operation(() => {
      doc.eachLine(from, to, line => {
        const lineNumber = doc.getLineNumber(line)

        // Clear?
        if (lineNumber === null) {
          return
        }

        const diffLine = diffLineForIndex(this.props.hunks, lineNumber)

        if (diffLine === null) {
          return
        }

        let marker: HTMLElement | null = null
        const lineInfo = cm.lineInfo(line)

        if (lineInfo.gutterMarkers && 'diff-gutter' in lineInfo.gutterMarkers) {
          marker = lineInfo.gutterMarkers['diff-gutter'] as HTMLElement
          this.updateGutterMarker(marker, lineNumber, line, diffLine)
        } else {
          marker = this.createGutterMarker(lineNumber, line, diffLine)
          cm.setGutterMarker(line, 'diff-gutter', marker)
        }
      })
    })
  }

  private getGutterLineClassNameInfo(
    index: number,
    diffLine: DiffLine
  ): { [className: string]: boolean } {
    let isIncluded = false
    const isIncludeable = diffLine.isIncludeableLine()

    if (this.props.file instanceof WorkingDirectoryFileChange) {
      isIncluded = isIncludeable && this.props.file.selection.isSelected(index)
    }

    const { type } = diffLine

    const hover =
      this.hunkHighlightRange === null
        ? false
        : index >= this.hunkHighlightRange.start &&
          index <= this.hunkHighlightRange.end

    return {
      'diff-line-gutter': true,
      'diff-add': type === DiffLineType.Add,
      'diff-delete': type === DiffLineType.Delete,
      'diff-context': type === DiffLineType.Context,
      'diff-hunk': type === DiffLineType.Hunk,
      'read-only': this.props.readOnly,
      includeable: isIncludeable && !this.props.readOnly,
      [selectedLineClass]: isIncluded,
      [hoverCssClass]: hover,
    }
  }

  private createGutterMarker(
    index: number,
    line: LineHandle,
    diffLine: DiffLine
  ): HTMLElement | null {
    const marker = document.createElement('div')
    marker.className = 'diff-line-gutter'

    const oldLineNumber = document.createElement('div')
    oldLineNumber.textContent =
      diffLine.oldLineNumber === null ? '' : `${diffLine.oldLineNumber}`
    oldLineNumber.classList.add('diff-line-number', 'before')
    marker.appendChild(oldLineNumber)

    const newLineNumber = document.createElement('div')
    newLineNumber.textContent =
      diffLine.newLineNumber === null ? '' : `${diffLine.newLineNumber}`
    newLineNumber.classList.add('diff-line-number', 'after')
    marker.appendChild(newLineNumber)

    const hunkHandle = document.createElement('div')
    hunkHandle.addEventListener('mouseenter', this.onHunkHandleMouseEnter)
    hunkHandle.addEventListener('mouseleave', this.onHunkHandleMouseLeave)
    hunkHandle.addEventListener('mousedown', this.onHunkHandleMouseDown)
    hunkHandle.classList.add('hunk-handle')
    marker.appendChild(hunkHandle)

    this.updateGutterMarker(marker, index, line, diffLine)

    return marker
  }

  private updateGutterMarker(
    marker: HTMLElement,
    index: number,
    line: LineHandle,
    diffLine: DiffLine
  ) {
    const classNameInfo = this.getGutterLineClassNameInfo(index, diffLine)
    for (const [className, include] of Object.entries(classNameInfo)) {
      if (include) {
        marker.classList.add(className)
      } else {
        marker.classList.remove(className)
      }
    }
    if (!this.props.readOnly && diffLine.isIncludeableLine()) {
      marker.setAttribute('role', 'button')
    } else {
      marker.removeAttribute('role')
    }
  }

  private onHunkHandleMouseEnter = (ev: MouseEvent) => {
    if (this.codeMirror === null || this.props.readOnly) {
      return
    }
    const lineNumber = this.codeMirror.lineAtHeight(ev.y)

    const diffLine = diffLineForIndex(this.props.hunks, lineNumber)

    if (!diffLine || !diffLine.isIncludeableLine()) {
      return
    }

    const range = findInteractiveDiffRange(this.props.hunks, lineNumber)

    this.hunkHighlightRange = range
    console.log('hunk handle mouse enter')
    this.updateViewport()
  }

  private updateViewport() {
    if (!this.codeMirror) {
      return
    }
    const { from, to } = this.codeMirror.getViewport()
    this.onViewportChange(this.codeMirror, from, to)
  }

  private onHunkHandleMouseLeave = (ev: MouseEvent) => {
    console.log('hunk handle mouse leave')
    this.hunkHighlightRange = null
    this.updateViewport()
  }

  private onHunkHandleMouseDown = (ev: MouseEvent) => {
    if (!this.codeMirror) {
      return
    }

    if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
      return
    }

    const lineNumber = this.codeMirror.lineAtHeight(ev.y)

    ev.preventDefault()
    this.startSelection(this.props.file, this.props.hunks, lineNumber, true)
  }

  public componentWillReceiveProps(nextProps: ITextDiffProps) {
    const codeMirror = this.codeMirror
    if (codeMirror && this.props.text !== nextProps.text) {
      codeMirror.setOption('mode', { name: DiffSyntaxMode.ModeName })
    }
  }

  public componentWillUnmount() {
    this.dispose()
  }

  public componentDidUpdate(
    prevProps: ITextDiffProps,
    prevState: {},
    // tslint:disable-next-line:react-proper-lifecycle-methods
    snapshot: CodeMirror.ScrollInfo | null
  ) {
    if (this.codeMirror !== null) {
      // No need to keep potentially tons of diff gutter DOM
      // elements around in memory when we're switching files.
      if (this.props.file.id !== prevProps.file.id) {
        this.codeMirror.clearGutter('diff-gutter')
      }

      if (this.props.file instanceof WorkingDirectoryFileChange) {
        if (
          !(prevProps instanceof WorkingDirectoryFileChange) ||
          this.props.file.selection !== prevProps.selection
        ) {
          // If the text has changed the gutters will be recreated
          // regardless but if it hasn't then we'll need to update
          // the viewport.
          if (this.props.text === prevProps.text) {
            const { from, to } = this.codeMirror.getViewport()
            this.onViewportChange(this.codeMirror, from, to)
          }
        }
      }
    }

    if (this.props.text === prevProps.text) {
      return
    }

    if (this.codeMirror) {
      this.codeMirror.setOption('mode', { name: DiffSyntaxMode.ModeName })

      if (snapshot !== null) {
        console.log('restoring scroll position')
        this.codeMirror.scrollTo(undefined, snapshot.top)
      }
    }

    this.initDiffSyntaxMode()
  }

  public getSnapshotBeforeUpdate(prevProps: ITextDiffProps) {
    if (this.codeMirror) {
      if (this.props.file.id === prevProps.file.id) {
        return this.codeMirror.getScrollInfo()
      }
    }
    return null
  }

  public componentDidMount() {
    this.initDiffSyntaxMode()
  }

  public render() {
    return (
      <CodeMirrorHost
        className="diff-code-mirror"
        value={this.getFormattedText(this.props.text)}
        options={defaultEditorOptions}
        isSelectionEnabled={this.isSelectionEnabled}
        onChanges={this.onChanges}
        onViewportChange={this.onViewportChange}
        onRenderLine={this.renderLine}
        ref={this.getAndStoreCodeMirrorInstance}
        onCopy={this.onCopy}
      />
    )
  }
}
