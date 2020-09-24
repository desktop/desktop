import * as React from 'react'
import { clipboard } from 'electron'
import { Editor, Doc } from 'codemirror'

import {
  DiffHunk,
  DiffLineType,
  DiffSelection,
  DiffLine,
  ITextDiff,
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
  DiffRangeType,
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
import { uuid } from '../../lib/uuid'
import { showContextualMenu } from '../main-process-proxy'
import { IMenuItem } from '../../lib/menu-item'
import { enableDiscardLines } from '../../lib/feature-flag'
import { canSelect } from './diff-helpers'

/** The longest line for which we'd try to calculate a line diff. */
const MaxIntraLineDiffStringLength = 4096

// This is a custom version of the no-newline octicon that's exactly as
// tall as it needs to be (8px) which helps with aligning it on the line.
export const narrowNoNewlineSymbol = new OcticonSymbol(
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
    (newProps.file.id === prevProps.file.id &&
      newProps.diff.text === prevProps.diff.text)
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
  const titleId = uuid()

  const { w, h, d } = narrowNoNewlineSymbol

  const xmlns = 'http://www.w3.org/2000/svg'
  const svgElem = document.createElementNS(xmlns, 'svg')
  svgElem.setAttribute('version', '1.1')
  svgElem.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svgElem.setAttribute('role', 'img')
  svgElem.setAttribute('aria-labelledby', titleId)
  svgElem.classList.add('no-newline')

  const titleElem = document.createElementNS(xmlns, 'title')
  titleElem.setAttribute('id', titleId)
  titleElem.setAttribute('lang', 'en')
  titleElem.textContent = 'No newline at end of file'
  svgElem.appendChild(titleElem)

  const pathElem = document.createElementNS(xmlns, 'path')
  pathElem.setAttribute('role', 'presentation')
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

interface ITextDiffProps {
  readonly repository: Repository
  /** The file whose diff should be displayed. */
  readonly file: ChangedFile
  /** The diff that should be rendered */
  readonly diff: ITextDiff
  /** If true, no selections or discards can be done against this diff. */
  readonly readOnly: boolean
  /**
   * Called when the includedness of lines or a range of lines has changed.
   * Only applicable when readOnly is false.
   */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void
  /**
   * Called when the user wants to discard a selection of the diff.
   * Only applicable when readOnly is false.
   */
  readonly onDiscardChanges?: (
    diff: ITextDiff,
    diffSelection: DiffSelection
  ) => void
  /**
   * Whether we'll show a confirmation dialog when the user
   * discards changes.
   */
  readonly askForConfirmationOnDiscardChanges?: boolean
}

const diffGutterName = 'diff-gutter'

function showSearch(cm: Editor) {
  const wrapper = cm.getWrapperElement()

  // Is there already a dialog open? If so we'll attempt to move
  // focus there instead of opening another dialog since CodeMirror
  // doesn't auto-close dialogs when opening a new one.
  const existingSearchField = wrapper.querySelector(
    ':scope > .CodeMirror-dialog .CodeMirror-search-field'
  )

  if (existingSearchField !== null) {
    if (existingSearchField instanceof HTMLElement) {
      existingSearchField.focus()
    }
    return
  }

  cm.execCommand('findPersistent')

  const dialog = wrapper.querySelector('.CodeMirror-dialog')

  if (dialog === null) {
    return
  }

  dialog.classList.add('CodeMirror-search-dialog')
  const searchField = dialog.querySelector('.CodeMirror-search-field')

  if (searchField instanceof HTMLInputElement) {
    searchField.placeholder = 'Search'
    searchField.style.removeProperty('width')
  }
}

/**
 * Scroll the editor vertically by either line or page the number
 * of times specified by the `step` parameter.
 *
 * This differs from the moveV function in CodeMirror in that it
 * doesn't attempt to scroll by moving the cursor but rather by
 * actually changing the scrollTop (if possible).
 */
function scrollEditorVertically(step: number, unit: 'line' | 'page') {
  return (cm: Editor) => {
    // The magic number 4 here is specific to Desktop and it's
    // the extra padding we put around lines (2px below and 2px
    // above)
    const lineHeight = Math.round(cm.defaultTextHeight() + 4)
    const scrollInfo = cm.getScrollInfo()

    if (unit === 'line') {
      cm.scrollTo(undefined, scrollInfo.top + step * lineHeight)
    } else {
      // We subtract one line from the page height to keep som
      // continuity when scrolling. Scrolling a full page leaves
      // the user without any anchor point
      const pageHeight = scrollInfo.clientHeight - lineHeight
      cm.scrollTo(undefined, scrollInfo.top + step * pageHeight)
    }
  }
}

const defaultEditorOptions: IEditorConfigurationExtra = {
  lineNumbers: false,
  readOnly: true,
  showCursorWhenSelecting: false,
  cursorBlinkRate: -1,
  lineWrapping: true,
  mode: { name: DiffSyntaxMode.ModeName },
  // Make sure CodeMirror doesn't capture Tab (and Shift-Tab) and thus destroy tab navigation
  extraKeys: {
    Tab: false,
    Home: 'goDocStart',
    End: 'goDocEnd',
    'Shift-Tab': false,
    // Steal the default key binding so that we can launch our
    // custom search UI.
    [__DARWIN__ ? 'Cmd-F' : 'Ctrl-F']: showSearch,
    // Disable all other search-related shortcuts so that they
    // don't interfere with global app shortcuts.
    [__DARWIN__ ? 'Cmd-G' : 'Ctrl-G']: false, // findNext
    [__DARWIN__ ? 'Shift-Cmd-G' : 'Shift-Ctrl-G']: false, // findPrev
    [__DARWIN__ ? 'Cmd-Alt-F' : 'Shift-Ctrl-F']: false, // replace
    [__DARWIN__ ? 'Shift-Cmd-Alt-F' : 'Shift-Ctrl-R']: false, // replaceAll
    Down: scrollEditorVertically(1, 'line'),
    Up: scrollEditorVertically(-1, 'line'),
    PageDown: scrollEditorVertically(1, 'page'),
    PageUp: scrollEditorVertically(-1, 'page'),
  },
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
      const lines = new Array<number>()
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

  /**
   * When CodeMirror swaps documents it will usually lead to the
   * viewportChange event being emitted but there are several scenarios
   * where that doesn't happen (where the viewport happens to be the same
   * after swapping). We set this field to false whenever we get notified
   * that a document is about to get swapped out (`onSwapDoc`), and we set it
   * to true on each call to `onViewportChanged` allowing us to check in
   * the post-swap event (`onAfterSwapDoc`) whether the document swap
   * triggered a viewport change event or not.
   *
   * This is important because we rely on the viewportChange event to
   * know when to update our gutters and by leveraging this field we
   * can ensure that we always repaint gutter on each document swap and
   * that we only do so once per document swap.
   */
  private swappedDocumentHasUpdatedViewport = true

  private async initDiffSyntaxMode() {
    if (!this.codeMirror) {
      return
    }

    const { file, diff, repository } = this.props

    // Store the current props to that we can see if anything
    // changes from underneath us as we're making asynchronous
    // operations that makes our data stale or useless.
    const propsSnapshot = this.props

    const lineFilters = getLineFilters(diff.hunks)
    const tsOpt = this.codeMirror.getOption('tabSize')
    const tabSize = typeof tsOpt === 'number' ? tsOpt : 4

    const contents = await getFileContents(repository, file, lineFilters)

    if (!highlightParametersEqual(this.props, propsSnapshot)) {
      return
    }

    const tokens = await highlightContents(contents, tabSize, lineFilters)

    if (!highlightParametersEqual(this.props, propsSnapshot)) {
      return
    }

    const spec: IDiffSyntaxModeSpec = {
      name: DiffSyntaxMode.ModeName,
      hunks: this.props.diff.hunks,
      oldTokens: tokens.oldTokens,
      newTokens: tokens.newTokens,
    }

    if (this.codeMirror) {
      this.codeMirror.setOption('mode', spec)
    }
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
    if (
      this.codeMirror === null ||
      this.selection === null ||
      this.selection.kind !== 'range'
    ) {
      return
    }

    // CodeMirror can return a line that doesn't exist if the
    // pointer is placed underneath the last line so we clamp it
    // to the range of valid values.
    const max = Math.max(0, this.codeMirror.getDoc().lineCount() - 1)
    const to = clamp(this.codeMirror.lineAtHeight(ev.y), 0, max)

    this.codeMirror.scrollIntoView({ line: to, ch: 0 })

    if (to !== this.selection.to) {
      this.selection = { ...this.selection, to }
      this.updateViewport()
    }
  }

  private onDocumentMouseUp = (ev: MouseEvent) => {
    ev.preventDefault()

    // We only care about the primary button here, secondary
    // button clicks are handled by `onContextMenu`
    if (ev.button !== 0) {
      return
    }

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

  private onContextMenu = (instance: CodeMirror.Editor, event: Event) => {
    const selectionRanges = instance.getDoc().listSelections()
    const isTextSelected = selectionRanges != null

    const action = () => {
      if (this.onCopy !== null) {
        this.onCopy(instance, event)
      }
    }

    const items: IMenuItem[] = [
      {
        label: 'Copy',
        action,
        enabled: this.onCopy && isTextSelected,
      },
    ]

    const discardMenuItems = this.buildDiscardMenuItems(instance, event)
    if (discardMenuItems !== null) {
      items.push({ type: 'separator' }, ...discardMenuItems)
    }

    showContextualMenu(items)
  }

  private buildDiscardMenuItems(
    editor: CodeMirror.Editor,
    event: Event
  ): ReadonlyArray<IMenuItem> | null {
    if (!enableDiscardLines()) {
      return null
    }

    const file = this.props.file

    if (this.props.readOnly || !canSelect(file)) {
      // Changes can't be discarded in readOnly mode.
      return null
    }

    if (!(event instanceof MouseEvent)) {
      // We can only infer which line was clicked when the context menu is opened
      // via a mouse event.
      return null
    }

    if (!this.props.onDiscardChanges) {
      return null
    }

    const lineNumber = editor.lineAtHeight(event.y)
    const diffLine = diffLineForIndex(this.props.diff.hunks, lineNumber)
    if (diffLine === null || !diffLine.isIncludeableLine()) {
      // Do not show the discard options for lines that are not additions/deletions.
      return null
    }

    const range = findInteractiveDiffRange(this.props.diff.hunks, lineNumber)
    if (range === null) {
      return null
    }

    if (range.type === null) {
      return null
    }

    // When user opens the context menu from the hunk handle, we should
    // discard the range of changes that from that hunk.
    if (targetHasClass(event.target, 'hunk-handle')) {
      return [
        {
          label: this.getDiscardLabel(range.type, range.to - range.from + 1),
          action: () => this.onDiscardChanges(file, range.from, range.to),
        },
      ]
    }

    // When user opens the context menu from a specific line, we should
    // discard only that line.
    if (targetHasClass(event.target, 'diff-line-number')) {
      // We don't allow discarding individual lines on hunks that have both
      // added and modified lines, since that can lead to unexpected results
      // (e.g discarding the added line on a hunk that is a 1-line modification
      // will leave the line deleted).
      return [
        {
          label: this.getDiscardLabel(range.type, 1),
          action: () => this.onDiscardChanges(file, lineNumber),
          enabled: range.type !== DiffRangeType.Mixed,
        },
      ]
    }

    return null
  }

  private onDiscardChanges(
    file: WorkingDirectoryFileChange,
    startLine: number,
    endLine: number = startLine
  ) {
    if (!this.props.onDiscardChanges) {
      return
    }

    const selection = file.selection
      .withSelectNone()
      .withRangeSelection(startLine, endLine - startLine + 1, true)

    this.props.onDiscardChanges(this.props.diff, selection)
  }

  private getDiscardLabel(rangeType: DiffRangeType, numLines: number): string {
    const suffix = this.props.askForConfirmationOnDiscardChanges ? '…' : ''
    let type = ''

    if (rangeType === DiffRangeType.Additions) {
      type = __DARWIN__ ? 'Added' : 'added'
    } else if (rangeType === DiffRangeType.Deletions) {
      type = __DARWIN__ ? 'Removed' : 'removed'
    } else if (rangeType === DiffRangeType.Mixed) {
      type = __DARWIN__ ? 'Modified' : 'modified'
    } else {
      assertNever(rangeType, `Invalid range type: ${rangeType}`)
    }

    const plural = numLines > 1 ? 's' : ''
    return __DARWIN__
      ? `Discard ${type} Line${plural}${suffix}`
      : `Discard ${type} line${plural}${suffix}`
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
    this.swappedDocumentHasUpdatedViewport = false
    this.initDiffSyntaxMode()
    this.markIntraLineChanges(cm.getDoc(), this.props.diff.hunks)
  }

  /**
   * When we swap in a new document that happens to have the exact same number
   * of lines as the previous document and where neither of those document
   * needs scrolling (i.e the document doesn't extend beyond the visible area
   * of the editor) we technically never update the viewport as far as CodeMirror
   * is concerned, meaning that we don't get a chance to update our gutters.
   *
   * By subscribing to the event that happens immediately after the document
   * swap has been completed we can check for this condition and others that
   * cause the onViewportChange event to not be emitted while swapping documents,
   * (see `swappedDocumentHasUpdatedViewport`) and explicitly update the viewport
   * (and thereby the gutters).
   */
  private onAfterSwapDoc = (cm: Editor, oldDoc: Doc, newDoc: Doc) => {
    if (!this.swappedDocumentHasUpdatedViewport) {
      this.updateViewport()
    }
  }

  private onViewportChange = (cm: Editor, from: number, to: number) => {
    const doc = cm.getDoc()
    const batchedOps = new Array<Function>()

    this.swappedDocumentHasUpdatedViewport = true

    doc.eachLine(from, to, line => {
      const lineNumber = doc.getLineNumber(line)

      if (lineNumber !== null) {
        const diffLine = diffLineForIndex(this.props.diff.hunks, lineNumber)

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

    const diffLine = diffLineForIndex(this.props.diff.hunks, lineNumber)

    if (!diffLine || !diffLine.isIncludeableLine()) {
      return
    }

    const range = findInteractiveDiffRange(this.props.diff.hunks, lineNumber)

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

    // We only care about the primary button here, secondary
    // button clicks are handled by `onContextMenu`
    if (ev.button !== 0) {
      return
    }

    const { file, diff, readOnly } = this.props

    if (!canSelect(file) || readOnly) {
      return
    }

    ev.preventDefault()

    const lineNumber = this.codeMirror.lineAtHeight(ev.y)
    this.startSelection(file, diff.hunks, lineNumber, 'range')
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

    // We only care about the primary button here, secondary
    // button clicks are handled by `onContextMenu`
    if (ev.button !== 0) {
      return
    }

    const { file, diff, readOnly } = this.props

    if (!canSelect(file) || readOnly) {
      return
    }

    ev.preventDefault()

    const lineNumber = this.codeMirror.lineAtHeight(ev.y)
    this.startSelection(file, diff.hunks, lineNumber, 'hunk')
  }

  public componentWillUnmount() {
    this.cancelSelection()
    this.codeMirror = null
    document.removeEventListener('find-text', this.onFindText)
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
        if (this.props.diff.text === prevProps.diff.text) {
          this.updateViewport()
        }
      }
    }

    if (snapshot !== null) {
      this.codeMirror.scrollTo(undefined, snapshot.top)
    }
  }

  public getSnapshotBeforeUpdate(prevProps: ITextDiffProps) {
    // Store the scroll position when the file stays the same
    // but we probably swapped out the document
    if (
      this.codeMirror !== null &&
      this.props.file !== prevProps.file &&
      this.props.file.id === prevProps.file.id &&
      this.props.diff.text !== prevProps.diff.text
    ) {
      return this.codeMirror.getScrollInfo()
    }
    return null
  }

  public componentDidMount() {
    this.initDiffSyntaxMode()

    // Listen for the custom event find-text (see app.tsx)
    // and trigger the search plugin if we see it.
    document.addEventListener('find-text', this.onFindText)
  }

  private onFindText = (ev: Event) => {
    if (!ev.defaultPrevented && this.codeMirror) {
      ev.preventDefault()
      showSearch(this.codeMirror)
    }
  }

  public render() {
    const doc = this.getCodeMirrorDocument(
      this.props.diff.text,
      this.getNoNewlineIndicatorLines(this.props.diff.hunks)
    )

    return (
      <CodeMirrorHost
        className="diff-code-mirror"
        value={doc}
        options={defaultEditorOptions}
        isSelectionEnabled={this.isSelectionEnabled}
        onSwapDoc={this.onSwapDoc}
        onAfterSwapDoc={this.onAfterSwapDoc}
        onViewportChange={this.onViewportChange}
        ref={this.getAndStoreCodeMirrorInstance}
        onContextMenu={this.onContextMenu}
        onCopy={this.onCopy}
      />
    )
  }
}
