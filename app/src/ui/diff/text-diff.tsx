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
import { assertNever } from '../../lib/fatal-error'
import { clamp } from '../../lib/clamp'

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
  return (
    newProps === prevProps ||
    (newProps.file.id === prevProps.file.id && newProps.text === prevProps.text)
  )
}

type SelectionKind = 'hunk' | 'range'

interface ISelection {
  readonly from: number
  readonly to: number
  readonly kind: SelectionKind
  readonly isSelected: boolean
}

function createNoNewlineIndicatorWidget() {
  const widget = document.createElement('span')
  widget.title = 'No newline at end of file'

  const { w, h, d } = narrowNoNewlineSymbol

  var xmlns = 'http://www.w3.org/2000/svg'
  const svgElem = document.createElementNS(xmlns, 'svg')
  svgElem.setAttribute('aria-hidden', 'true')
  svgElem.setAttribute('version', '1.1')
  svgElem.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svgElem.classList.add('no-newline')

  const pathElem = document.createElementNS(xmlns, 'path')
  pathElem.setAttribute('d', d)
  pathElem.textContent = 'No newline at end of file'
  svgElem.appendChild(pathElem)

  widget.appendChild(svgElem)
  return widget
}

/**
 * Utility function to check whether a selection exists, and whether
 * the given index is contained within the selection.
 */
function inSelection(s: ISelection | null, ix: number): s is ISelection {
  if (s === null) {
    return false
  }
  return ix >= Math.min(s.from, s.to) && ix <= Math.max(s.to, s.from)
}

/** Utility function for checking whether an event target has a given CSS class */
function targetHasClass(target: EventTarget | null, token: string) {
  return target instanceof HTMLElement && target.classList.contains(token)
}

/** Utility function for checking whether a file supports selection */
function canSelect(file: ChangedFile): file is WorkingDirectoryFileChange {
  return file instanceof WorkingDirectoryFileChange
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

  private getCodeMirrorDocument = memoizeOne(
    (text: string, noNewlineIndicatorLines: ReadonlyArray<number>) => {
      const { mode, firstLineNumber, lineSeparator } = defaultEditorOptions
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
      if (text.indexOf('\r') !== -1) {
        // Capture the \r if followed by (positive lookahead) a \n or
        // the end of the string. Note that this does not capture the \n.
        text = text.replace(/\r(?=\n|$)/g, '')
      }

      const doc = new Doc(text, mode, firstLineNumber, lineSeparator)

      for (const noNewlineLine of noNewlineIndicatorLines) {
        doc.setBookmark(
          { line: noNewlineLine, ch: Infinity },
          { widget: createNoNewlineIndicatorWidget() }
        )
      }

      return doc
    },
    // Only re-run the memoization function if the text differs or the array
    // differs (by structural equality). Allows us to re-use the document as
    // much as possible, recreating it only if a no-newline appears/disappears
    structuralEquals
  )

  /**
   * Returns an array of line numbers that should be marked as lacking a
   * new line. Memoized such that even if `hunks` changes we don't have
   * to re-run getCodeMirrorDocument needlessly.
   */
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

  /** The current, active, diff gutter selection if any */
  private selection: ISelection | null = null

  /** Whether a particular range should be highlighted due to hover */
  private hunkHighlightRange: ISelection | null = null

  private async initDiffSyntaxMode() {
    const { file, hunks, repository } = this.props

    if (!this.codeMirror) {
      return
    }

    // Store the current props to that we can see if anything
    // changes from underneath us as we're making asynchronous
    // operations that makes our data stale or useless.
    const propsSnapshot = this.props

    const lineFilters = getLineFilters(hunks)
    const contents = await getFileContents(repository, file, lineFilters)

    if (!highlightParametersEqual(this.props, propsSnapshot)) {
      return
    }

    const tsOpt = this.codeMirror.getOption('tabSize')
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

    this.codeMirror.setOption('mode', spec)
  }

  /**
   * start a selection gesture based on the current interaction
   */
  private startSelection(
    file: WorkingDirectoryFileChange,
    hunks: ReadonlyArray<DiffHunk>,
    index: number,
    kind: SelectionKind
  ) {
    if (this.selection !== null) {
      this.cancelSelection()
    }

    const isSelected = !file.selection.isSelected(index)

    if (kind === 'hunk') {
      const range = findInteractiveDiffRange(hunks, index)
      if (!range) {
        console.error('unable to find range for given line in diff')
        return
      }

      const { from, to } = range
      this.selection = { isSelected, from, to, kind }
    } else if (kind === 'range') {
      this.selection = { isSelected, from: index, to: index, kind }
      document.addEventListener('mousemove', this.onDocumentMouseMove)
    } else {
      assertNever(kind, `Unknown selection kind ${kind}`)
    }

    document.addEventListener('mouseup', this.onDocumentMouseUp, { once: true })
  }

  private cancelSelection() {
    if (this.selection) {
      document.removeEventListener('mouseup', this.onDocumentMouseUp)
      document.removeEventListener('mousemove', this.onDocumentMouseMove)
      this.selection = null
      this.updateViewport()
    }
  }

  private onDocumentMouseMove = (ev: MouseEvent) => {
    if (this.codeMirror === null) {
      return
    }

    if (this.selection === null || this.selection.kind !== 'range') {
      return
    }

    // CodeMirror can return a line that doesn't exist if the
    // pointer is placed underneath the last line so we clamp it
    // to the range of valid values.
    const max = Math.max(0, this.codeMirror.getDoc().lineCount() - 1)
    const to = clamp(this.codeMirror.lineAtHeight(ev.y), 0, max)

    if (to !== this.selection.to) {
      this.selection = { ...this.selection, to }
      this.updateViewport()
    }
  }

  private onDocumentMouseUp = (ev: MouseEvent) => {
    ev.preventDefault()

    if (this.selection === null || this.codeMirror === null) {
      return this.cancelSelection()
    }

    // A range selection is when the user clicks on the "hunk handle"
    // which is a hit area spanning 10 or so pixels on either side of
    // the gutter border, extending into the text area. We capture the
    // mouse down event on that hunk handle and for the mouse up event
    // we need to make sure the user is still within that hunk handle
    // section and in the correct range.
    if (this.selection.kind === 'hunk') {
      // Is the pointer over the same range (i.e hunk) that the
      // selection was originally started from?
      if (
        !targetHasClass(ev.target, 'hunk-handle') ||
        !inSelection(this.selection, this.codeMirror.lineAtHeight(ev.y))
      ) {
        return this.cancelSelection()
      }
    } else if (this.selection.kind === 'range') {
      // Special case drag drop selections of 1 as single line 'click'
      // events for which we require that the cursor is still on the
      // original gutter element (i.e. if you mouse down on a gutter
      // element and move the mouse out of the gutter it should not
      // count as a click when you mouse up)
      if (this.selection.from === this.selection.to) {
        if (
          !targetHasClass(ev.target, 'diff-line-number') &&
          !targetHasClass(ev.target, 'diff-line-gutter')
        ) {
          return this.cancelSelection()
        }
      }
    } else {
      return assertNever(
        this.selection.kind,
        `Unknown selection kind ${this.selection.kind}`
      )
    }

    this.endSelection()
  }

  /**
   * complete the selection gesture and apply the change to the diff
   */
  private endSelection() {
    const { onIncludeChanged, file } = this.props
    if (onIncludeChanged && this.selection && canSelect(file)) {
      const current = file.selection
      const { isSelected } = this.selection

      const lower = Math.min(this.selection.from, this.selection.to)
      const upper = Math.max(this.selection.from, this.selection.to)
      const length = upper - lower + 1

      onIncludeChanged(current.withRangeSelection(lower, length, isSelected))
      this.selection = null
    }
  }

  private isSelectionEnabled = () => {
    return this.selection === null
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

      if (lineNumber !== null) {
        const diffLine = diffLineForIndex(this.props.hunks, lineNumber)

        if (diffLine !== null) {
          const lineInfo = cm.lineInfo(line)

          if (
            lineInfo.gutterMarkers &&
            diffGutterName in lineInfo.gutterMarkers
          ) {
            const marker = lineInfo.gutterMarkers[diffGutterName]
            if (marker instanceof HTMLElement) {
              this.updateGutterMarker(marker, lineNumber, diffLine)
            }
          } else {
            batchedOps.push(() => {
              const marker = this.createGutterMarker(lineNumber, diffLine)
              cm.setGutterMarker(line, diffGutterName, marker)
            })
          }
        }
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

  /**
   * Returns a value indicating whether the given line index is included
   * in the current temporary or permanent (props) selection. Note that
   * this function does not care about whether the line can be included,
   * only whether it is indicated to be included by either selection.
   */
  private isIncluded(index: number) {
    const { file } = this.props
    return inSelection(this.selection, index)
      ? this.selection.isSelected
      : canSelect(file) && file.selection.isSelected(index)
  }

  private getGutterLineClassNameInfo(
    index: number,
    diffLine: DiffLine
  ): { [className: string]: boolean } {
    const isIncludeable = diffLine.isIncludeableLine()
    const isIncluded = isIncludeable && this.isIncluded(index)
    const hover = isIncludeable && inSelection(this.hunkHighlightRange, index)

    return {
      'diff-line-gutter': true,
      'diff-add': diffLine.type === DiffLineType.Add,
      'diff-delete': diffLine.type === DiffLineType.Delete,
      'diff-context': diffLine.type === DiffLineType.Context,
      'diff-hunk': diffLine.type === DiffLineType.Hunk,
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
    if (this.codeMirror) {
      const { from, to } = this.codeMirror.getViewport()
      this.onViewportChange(this.codeMirror, from, to)
    }
  }

  private onDiffLineGutterMouseDown = (ev: MouseEvent) => {
    // If the event is prevented that means the hunk handle was
    // clicked first and prevented the default action so we'll bail.
    if (ev.defaultPrevented || this.codeMirror === null) {
      return
    }

    const { file, hunks, readOnly } = this.props

    if (!canSelect(file) || readOnly) {
      return
    }

    ev.preventDefault()

    const lineNumber = this.codeMirror.lineAtHeight(ev.y)
    this.startSelection(file, hunks, lineNumber, 'range')
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

    if (!canSelect(file) || readOnly) {
      return
    }

    ev.preventDefault()

    const lineNumber = this.codeMirror.lineAtHeight(ev.y)
    this.startSelection(file, hunks, lineNumber, 'hunk')
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

    if (canSelect(this.props.file)) {
      if (
        !canSelect(prevProps.file) ||
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
