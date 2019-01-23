import * as React from 'react'
import { clipboard } from 'electron'
import { Editor, Doc } from 'codemirror'

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

import { OcticonSymbol } from '../octicons'

import { IEditorConfigurationExtra } from './editor-configuration-extra'
import { DiffSyntaxMode, IDiffSyntaxModeSpec } from './diff-syntax-mode'
import { CodeMirrorHost } from './code-mirror-host'
import {
  diffLineForIndex,
  findInteractiveDiffRange,
  lineNumberForDiffLine,
} from './diff-explorer'

import {
  getLineFilters,
  getFileContents,
  highlightContents,
} from './syntax-highlighting'
import { relativeChanges } from './changed-range'
import { Repository } from '../../models/repository'
import memoizeOne from 'memoize-one'
import { structuralEquals } from '../../lib/equality'

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

interface ISelection {
  readonly from: number
  readonly to: number
  readonly kind: 'hunk' | 'range'
  readonly isSelected: boolean
}

function createNoNewlineIndicatorWidget() {
  const widget = document.createElement('span')
  widget.title = 'No newline at end of file'

  var xmlns = 'http://www.w3.org/2000/svg'
  const svgElem = document.createElementNS(xmlns, 'svg')
  svgElem.setAttribute('aria-hidden', 'true')
  svgElem.setAttribute('version', '1.1')
  svgElem.setAttribute(
    'viewBox',
    `0 0 ${narrowNoNewlineSymbol.w} ${narrowNoNewlineSymbol.h}`
  )
  svgElem.classList.add('no-newline')
  const pathElem = document.createElementNS(xmlns, 'path')
  pathElem.setAttribute('d', narrowNoNewlineSymbol.d)
  pathElem.textContent = 'No newline at end of file'
  svgElem.appendChild(pathElem)

  widget.appendChild(svgElem)
  return widget
}

interface ITextDiffProps {
  readonly repository: Repository
  readonly file: ChangedFile
  readonly readOnly: boolean
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void
  readonly text: string
  readonly hunks: ReadonlyArray<DiffHunk>
}

const diffGutterName = 'diff-gutter'

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
  gutters: [diffGutterName],
}

export class TextDiff extends React.Component<ITextDiffProps, {}> {
  private codeMirror: Editor | null = null

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

  private getCodeMirrorDocument = memoizeOne(
    (text: string, noNewlineIndicatorLines: ReadonlyArray<number>) => {
      console.log('recreating doc')
      const { mode, firstLineNumber, lineSeparator } = defaultEditorOptions
      const formattedText = this.getFormattedText(text)
      const doc = new Doc(formattedText, mode, firstLineNumber, lineSeparator)

      for (const noNewlineLine of noNewlineIndicatorLines) {
        doc.setBookmark(
          { line: noNewlineLine, ch: Infinity },
          { widget: createNoNewlineIndicatorWidget() }
        )
      }

      return doc
    },
    // Only re-run the memoization function if the text
    // differs or the array differs (by structural equality).
    // This let's us re-use the document as much as possible
    // while still recreating it if a no-newline indicator needs
    // to be added/removed.
    structuralEquals
  )

  private getNoNewlineIndicatorLines = memoizeOne(
    (hunks: ReadonlyArray<DiffHunk>) => {
      let lines = new Array<number>()
      for (const hunk of hunks) {
        for (const line of hunk.lines) {
          if (line.noTrailingNewLine) {
            lines.push(lineNumberForDiffLine(line, hunks))
          }
        }
      }
      return lines
    }
  )

  /**
   * Maintain the current state of the user interacting with the diff gutter
   */
  private selection: ISelection | null = null
  private hunkHighlightRange: ISelection | null = null

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
    const isSelected = !snapshot.isSelected(index)

    if (this.selection !== null) {
      this.cancelSelection()
    }

    if (isRangeSelection) {
      const range = findInteractiveDiffRange(hunks, index)
      if (!range) {
        console.error('unable to find range for given line in diff')
        return
      }

      const { from, to } = range
      this.selection = { isSelected, from, to, kind: 'hunk' }
    } else {
      this.selection = { isSelected, from: index, to: index, kind: 'range' }
      document.addEventListener('mousemove', this.onDocumentMouseMove)
    }

    document.addEventListener('mouseup', this.onDocumentMouseUp, { once: true })
  }

  private cancelSelection = () => {
    document.removeEventListener('mouseup', this.onDocumentMouseUp)
    document.removeEventListener('mousemove', this.onDocumentMouseMove)

    this.selection = null
  }

  private onDocumentMouseMove = (ev: MouseEvent) => {
    if (this.codeMirror === null) {
      return
    }

    if (this.selection === null || this.selection.kind !== 'range') {
      return
    }

    const lineNumber = this.codeMirror.lineAtHeight(ev.y)
    const { from, to } = this.selection

    const newSelection = {
      ...this.selection,
      from: lineNumber <= from ? lineNumber : from,
      to: lineNumber <= from ? to : lineNumber,
    }

    if (newSelection.from !== from || newSelection.to !== to) {
      this.selection = newSelection
      this.updateViewport()
    }
  }

  private onDocumentMouseUp = (ev: MouseEvent) => {
    ev.preventDefault()

    if (this.selection === null) {
      return
    }

    if (this.codeMirror === null) {
      return this.cancelSelection()
    }

    // A range selection is when the user clicks on the "hunk handle"
    // which is a hit area spanning 10 or so pixels on either side of
    // the gutter border, extending into the text area. We capture the
    // mouse down event on that hunk handle and for the mouse up event
    // we need to make sure the user is still within that hunk handle
    // section and in the correct range.
    if (this.selection.kind === 'hunk') {
      // Is the pointer over something that might be a hunk handle?
      if (ev.target === null || !(ev.target instanceof HTMLElement)) {
        return this.cancelSelection()
      }

      if (!ev.target.classList.contains('hunk-handle')) {
        return this.cancelSelection()
      }

      const { from, to } = this.selection
      const lineNumber = this.codeMirror.lineAtHeight(ev.y)

      // Is the pointer over the same range (i.e hunk) that the
      // selection was originally started from?
      if (lineNumber < from || lineNumber > to) {
        return this.cancelSelection()
      }
    } else if (this.selection.kind === 'range') {
      // Special case drag drop selections of 1 as single line 'click'
      // events for which we require that the cursor is still on the
      // original gutter element (i.e. if you mouse down on a gutter
      // element and move the mouse out of the gutter it should not
      // count as a click when you mouse up)
      if (this.selection.from - this.selection.to === 0) {
        if (ev.target === null || !(ev.target instanceof HTMLElement)) {
          return this.cancelSelection()
        }

        if (
          !ev.target.classList.contains('diff-line-number') &&
          !ev.target.classList.contains('diff-line-gutter')
        ) {
          return this.cancelSelection()
        }
      }
    }

    console.log(this.selection)
    this.endSelection()
  }

  /**
   * complete the selection gesture and apply the change to the diff
   */
  private endSelection = () => {
    if (!this.props.onIncludeChanged || !this.selection) {
      return
    }

    const { file } = this.props

    if (!(file instanceof WorkingDirectoryFileChange)) {
      return
    }

    const currentSelection = file.selection

    this.props.onIncludeChanged(
      currentSelection.withRangeSelection(
        this.selection.from,
        this.selection.to - this.selection.from + 1,
        this.selection.isSelected
      )
    )
    this.selection = null
  }

  private isSelectionEnabled = () => {
    return this.selection == null
  }

  private getAndStoreCodeMirrorInstance = (cmh: CodeMirrorHost | null) => {
    this.codeMirror = cmh === null ? null : cmh.getEditor()
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

  private markIntraLineChanges(doc: Doc, hunks: ReadonlyArray<DiffHunk>) {
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
            doc.markText(addFrom, addTo, { className: 'cm-diff-add-inner' })
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
            doc.markText(deleteFrom, deleteTo, {
              className: 'cm-diff-delete-inner',
            })
          }
        }
      }
    }
  }

  private onSwapDoc = (cm: Editor, oldDoc: Doc) => {
    this.initDiffSyntaxMode()
    this.markIntraLineChanges(cm.getDoc(), this.props.hunks)
  }

  private onViewportChange = (cm: Editor, from: number, to: number) => {
    const doc = cm.getDoc()
    const batchedOps = new Array<Function>()

    doc.eachLine(from, to, line => {
      const lineNumber = doc.getLineNumber(line)

      if (lineNumber === null) {
        return
      }

      const diffLine = diffLineForIndex(this.props.hunks, lineNumber)

      if (diffLine === null) {
        return
      }

      let marker: HTMLElement | null = null
      const lineInfo = cm.lineInfo(line)

      if (lineInfo.gutterMarkers && diffGutterName in lineInfo.gutterMarkers) {
        marker = lineInfo.gutterMarkers[diffGutterName] as HTMLElement
        this.updateGutterMarker(marker, lineNumber, diffLine)
      } else {
        batchedOps.push(() => {
          marker = this.createGutterMarker(lineNumber, diffLine)
          cm.setGutterMarker(line, diffGutterName, marker)
        })
      }
    })

    // Updating a gutter marker doesn't affect layout or rendering
    // as far as CodeMirror is concerned so we only run an operation
    // (which will trigger a CodeMirror refresh) when we have gutter
    // markers to create.
    if (batchedOps.length > 0) {
      cm.operation(() => batchedOps.forEach(x => x()))
    }
  }

  private getGutterLineClassNameInfo(
    index: number,
    diffLine: DiffLine
  ): { [className: string]: boolean } {
    const isIncludeable = diffLine.isIncludeableLine()

    let isIncluded = false

    if (isIncludeable) {
      if (
        this.selection !== null &&
        index >= this.selection.from &&
        index <= this.selection.to
      ) {
        isIncluded = this.selection.isSelected
      } else {
        isIncluded =
          this.props.file instanceof WorkingDirectoryFileChange &&
          this.props.file.selection.isSelected(index)
      }
    }

    const { type } = diffLine

    const hover =
      this.hunkHighlightRange === null
        ? false
        : index >= this.hunkHighlightRange.from &&
          index <= this.hunkHighlightRange.to &&
          isIncludeable

    return {
      'diff-line-gutter': true,
      'diff-add': type === DiffLineType.Add,
      'diff-delete': type === DiffLineType.Delete,
      'diff-context': type === DiffLineType.Context,
      'diff-hunk': type === DiffLineType.Hunk,
      'read-only': this.props.readOnly,
      'diff-line-selected': isIncluded,
      'diff-line-hover': hover,
      includeable: isIncludeable && !this.props.readOnly,
    }
  }

  private createGutterMarker(index: number, diffLine: DiffLine) {
    const marker = document.createElement('div')
    marker.className = 'diff-line-gutter'

    marker.addEventListener('mousedown', this.onDiffLineGutterMouseDown)

    const oldLineNumber = document.createElement('div')
    oldLineNumber.classList.add('diff-line-number', 'before')
    marker.appendChild(oldLineNumber)

    const newLineNumber = document.createElement('div')
    newLineNumber.classList.add('diff-line-number', 'after')
    marker.appendChild(newLineNumber)

    const hunkHandle = document.createElement('div')
    hunkHandle.addEventListener('mouseenter', this.onHunkHandleMouseEnter)
    hunkHandle.addEventListener('mouseleave', this.onHunkHandleMouseLeave)
    hunkHandle.addEventListener('mousedown', this.onHunkHandleMouseDown)
    hunkHandle.classList.add('hunk-handle')
    marker.appendChild(hunkHandle)

    this.updateGutterMarker(marker, index, diffLine)

    return marker
  }

  private updateGutterMarker(
    marker: HTMLElement,
    index: number,
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

    const oldLineNumber = marker.childNodes[0]

    oldLineNumber.textContent =
      diffLine.oldLineNumber === null ? '' : `${diffLine.oldLineNumber}`

    const newLineNumber = marker.childNodes[1]

    newLineNumber.textContent =
      diffLine.newLineNumber === null ? '' : `${diffLine.newLineNumber}`
  }

  private onHunkHandleMouseEnter = (ev: MouseEvent) => {
    if (
      this.codeMirror === null ||
      this.props.readOnly ||
      (this.selection !== null && this.selection.kind === 'range')
    ) {
      return
    }
    const lineNumber = this.codeMirror.lineAtHeight(ev.y)

    const diffLine = diffLineForIndex(this.props.hunks, lineNumber)

    if (!diffLine || !diffLine.isIncludeableLine()) {
      return
    }

    const range = findInteractiveDiffRange(this.props.hunks, lineNumber)

    if (range === null) {
      return
    }

    const { from, to } = range
    this.hunkHighlightRange = { from, to, kind: 'hunk', isSelected: false }
    this.updateViewport()
  }

  private updateViewport() {
    if (!this.codeMirror) {
      return
    }
    const { from, to } = this.codeMirror.getViewport()
    this.onViewportChange(this.codeMirror, from, to)
  }

  private onDiffLineGutterMouseDown = (ev: MouseEvent) => {
    // If the event is prevented that means the hunk handle was
    // clicked first and prevented the default action so we'll bail.
    if (ev.defaultPrevented || this.codeMirror === null) {
      return
    }

    const { file, hunks, readOnly } = this.props

    if (!(file instanceof WorkingDirectoryFileChange) || readOnly) {
      return
    }

    ev.preventDefault()

    const lineNumber = this.codeMirror.lineAtHeight(ev.y)
    this.startSelection(file, hunks, lineNumber, false)
  }

  private onHunkHandleMouseLeave = (ev: MouseEvent) => {
    if (this.hunkHighlightRange !== null) {
      this.hunkHighlightRange = null
      this.updateViewport()
    }
  }

  private onHunkHandleMouseDown = (ev: MouseEvent) => {
    if (!this.codeMirror) {
      return
    }

    const { file, hunks, readOnly } = this.props

    if (!(file instanceof WorkingDirectoryFileChange) || readOnly) {
      return
    }

    ev.preventDefault()

    const lineNumber = this.codeMirror.lineAtHeight(ev.y)
    this.startSelection(file, hunks, lineNumber, true)
  }

  public componentWillUnmount() {
    this.cancelSelection()
    this.codeMirror = null
  }

  public componentDidUpdate(
    prevProps: ITextDiffProps,
    prevState: {},
    // tslint:disable-next-line:react-proper-lifecycle-methods
    snapshot: CodeMirror.ScrollInfo | null
  ) {
    if (this.codeMirror === null) {
      return
    }

    // No need to keep potentially tons of diff gutter DOM
    // elements around in memory when we're switching files.
    if (this.props.file.id !== prevProps.file.id) {
      this.codeMirror.clearGutter(diffGutterName)
    }

    if (this.props.file instanceof WorkingDirectoryFileChange) {
      if (
        !(prevProps.file instanceof WorkingDirectoryFileChange) ||
        this.props.file.selection !== prevProps.file.selection
      ) {
        // If the text has changed the gutters will be recreated
        // regardless but if it hasn't then we'll need to update
        // the viewport.
        if (this.props.text === prevProps.text) {
          this.updateViewport()
        }
      }
    }

    if (snapshot !== null) {
      this.codeMirror.scrollTo(undefined, snapshot.top)
    }
  }

  public getSnapshotBeforeUpdate(prevProps: ITextDiffProps) {
    if (this.codeMirror !== null && this.props.file.id === prevProps.file.id) {
      return this.codeMirror.getScrollInfo()
    }
    return null
  }

  public componentDidMount() {
    this.initDiffSyntaxMode()
  }

  public render() {
    const doc = this.getCodeMirrorDocument(
      this.props.text,
      this.getNoNewlineIndicatorLines(this.props.hunks)
    )

    return (
      <CodeMirrorHost
        className="diff-code-mirror"
        value={doc}
        options={defaultEditorOptions}
        isSelectionEnabled={this.isSelectionEnabled}
        onSwapDoc={this.onSwapDoc}
        onViewportChange={this.onViewportChange}
        ref={this.getAndStoreCodeMirrorInstance}
        onCopy={this.onCopy}
      />
    )
  }
}
