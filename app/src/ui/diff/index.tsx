import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Disposable } from 'event-kit'

import { NewImageDiff } from './new-image-diff'
import { ModifiedImageDiff } from './modified-image-diff'
import { DeletedImageDiff } from './deleted-image-diff'
import { BinaryFile } from './binary-file'

import { Editor } from 'codemirror'
import { CodeMirrorHost } from './code-mirror-host'
import { Repository } from '../../models/repository'

import { FileChange, WorkingDirectoryFileChange, FileStatus } from '../../models/status'
import { DiffHunk, DiffLine, DiffLineType, Diff as DiffModel, DiffSelection, ImageDiff } from '../../models/diff'
import { Dispatcher } from '../../lib/dispatcher/dispatcher'

import { DiffLineGutter } from './diff-line-gutter'
import { IEditorConfigurationExtra } from './editor-configuration-extra'
import { getDiffMode } from './diff-mode'
import { ISelectionStrategy } from './selection/selection-strategy'
import { DragDropSelection } from './selection/drag-drop-selection-strategy'
import { HunkSelection } from './selection/hunk-selection-strategy'
import { hoverCssClass } from './selection/selection'

import { fatalError } from '../../lib/fatal-error'

if (__DARWIN__) {
  // This has to be required to support the `simple` scrollbar style.
  require('codemirror/addon/scroll/simplescrollbars')
}

/** The props for the Diff component. */
interface IDiffProps {
  readonly repository: Repository

  /**
   * Whether the diff is readonly, e.g., displaying a historical diff, or the
   * diff's lines can be selected, e.g., displaying a change in the working
   * directory.
   */
  readonly readOnly: boolean

  /** The file whose diff should be displayed. */
  readonly file: FileChange

  /** Called when the includedness of lines or hunks has changed. */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void

  /** The diff that should be rendered */
  readonly diff: DiffModel

  /** propagate errors up to the main application */
  readonly dispatcher: Dispatcher
}

/** A component which renders a diff for a file. */
export class Diff extends React.Component<IDiffProps, void> {
  private codeMirror: any | null

  /**
   * We store the scroll position before reloading the same diff so that we can
   * restore it when we're done. If we're not reloading the same diff, this'll
   * be null.
   */
  private scrollPositionToRestore: { left: number, top: number } | null = null

  /**
   * A mapping from CodeMirror line handles to disposables which, when disposed
   * cleans up any line gutter components and events associated with that line.
   * See renderLine for more information.
   */
  private readonly lineCleanup = new Map<any, Disposable>()

  /**
   * Maintain the current state of the user interacting with the diff gutter
   */
  private selection: ISelectionStrategy | null = null

  /**
   *  a local cache of gutter elements, keyed by the row in the diff
   */
  private cachedGutterElements = new Map<number, HTMLSpanElement>()


  public componentWillReceiveProps(nextProps: IDiffProps) {
    // If we're reloading the same file, we want to save the current scroll
    // position and restore it after the diff's been updated.
    const sameFile = nextProps.file && this.props.file && nextProps.file.id === this.props.file.id
    const codeMirror = this.codeMirror
    if (codeMirror && sameFile) {
      const scrollInfo = codeMirror.getScrollInfo()
      this.scrollPositionToRestore = { left: scrollInfo.left, top: scrollInfo.top }
    } else {
      this.scrollPositionToRestore = null
    }
  }

  public componentWillUnmount() {
    this.dispose()
  }

  private dispose() {
    this.codeMirror = null

    this.lineCleanup.forEach((disposable) => disposable.dispose())
    this.lineCleanup.clear()
  }

  private onMouseDown(index: number, selected: boolean, isHunkSelection: boolean) {
    if (this.props.readOnly) {
      return
    }

    if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
      fatalError('must not start selection when selected file is not a WorkingDirectoryFileChange')
      return
    }
    const snapshot = this.props.file.selection
    const desiredSelection = !selected

    if (isHunkSelection) {
      const hunk = this.props.diff.diffHunkForIndex(index)
      if (!hunk) {
        console.error('unable to find hunk for given line in diff')
        return
      }

      const start = hunk.unifiedDiffStart
      const length = hunk.unifiedDiffEnd - hunk.unifiedDiffStart
      this.selection = new HunkSelection(start, length, desiredSelection, snapshot)
    } else {
      this.selection = new DragDropSelection(index, desiredSelection, snapshot)
    }

    this.selection.paint(this.cachedGutterElements)
  }

  private onMouseUp(index: number) {
    if (this.props.readOnly || !this.props.onIncludeChanged) {
      return
    }

    if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
      fatalError('must not complete selection when selected file is not a WorkingDirectoryFileChange')
      return
    }

    const selection = this.selection
    if (!selection) {
      return
    }

    selection.apply(this.props.onIncludeChanged)

    // operation is completed, clean this up
    this.selection = null
  }

  private isIncludableLine(line: DiffLine): boolean {
    return line.type === DiffLineType.Add || line.type === DiffLineType.Delete
  }

  private isMouseInLeftColumn(ev: MouseEvent): boolean {
    // MouseEvent is not generic, but getBoundingClientRect should be
    // available for all HTML elements
    // docs: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect

    const element: any = ev.currentTarget
    const offset: ClientRect = element.getBoundingClientRect()
    const relativeLeft = ev.clientX - offset.left

    const width = offset.width

    return relativeLeft < (width / 2)
  }

  private highlightHunk(hunk: DiffHunk, show: boolean) {
    const start = hunk.unifiedDiffStart

    hunk.lines.forEach((line, index) => {
      if (this.isIncludableLine(line)) {
        const row = start + index
        this.highlightLine(row, show)
      }
    })
  }

  private highlightLine(row: number, include: boolean) {
    const element = this.cachedGutterElements.get(row)

    if (!element) {
      console.error('expected gutter element not found')
      return
    }

    const childSpan = element.children[0] as HTMLSpanElement
    if (!childSpan) {
      console.error('expected DOM element for diff gutter not found')
      return
    }

    if (include) {
      childSpan.classList.add(hoverCssClass)
    } else {
      childSpan.classList.remove(hoverCssClass)
    }
  }

  public renderLine = (instance: any, line: any, element: HTMLElement) => {

    const existingLineDisposable = this.lineCleanup.get(line)

    // If we can find the line in our cleanup list that means the line is
    // being re-rendered. Agains, CodeMirror doesn't fire the 'delete' event
    // when this happens.
    if (existingLineDisposable) {
      existingLineDisposable.dispose()
      this.lineCleanup.delete(line)
    }

    const index = instance.getLineNumber(line)
    const hunk = this.props.diff.diffHunkForIndex(index)
    if (hunk) {
      const relativeIndex = index - hunk.unifiedDiffStart
      const diffLine = hunk.lines[relativeIndex]
      if (diffLine) {
        const diffLineElement = element.children[0] as HTMLSpanElement

        const reactContainer = document.createElement('span')

        const mouseEnterHandler = (ev: MouseEvent) => {
          ev.preventDefault()

          if (!this.isIncludableLine(diffLine)) {
            return
          }

          if (this.isMouseInLeftColumn(ev)) {
            this.highlightHunk(hunk, true)
          } else {
            this.highlightLine(index, true)
          }
        }

        const mouseLeaveHandler = (ev: MouseEvent) => {
          ev.preventDefault()

          if (!this.isIncludableLine(diffLine)) {
            return
          }

          if (this.isMouseInLeftColumn(ev)) {
            this.highlightHunk(hunk, false)
          } else {
            this.highlightLine(index, false)
          }
        }

        const mouseDownHandler = (ev: MouseEvent) => {
          ev.preventDefault()

          const isHunkSelection = this.isMouseInLeftColumn(ev)

          let isIncluded = false
          if (this.props.file instanceof WorkingDirectoryFileChange) {
            isIncluded = this.props.file.selection.isSelected(index)
          }
          this.onMouseDown(index, isIncluded, isHunkSelection)
        }

        const mouseMoveHandler = (ev: MouseEvent) => {

          ev.preventDefault()

          // ignoring anything from diff context rows
          if (!this.isIncludableLine(diffLine)) {
            return
          }

          // if selection is active, perform highlighting
          if (!this.selection) {

            // clear hunk selection in case transitioning from hunk->line
            this.highlightHunk(hunk, false)

            if (this.isMouseInLeftColumn(ev)) {
              this.highlightHunk(hunk, true)
            } else {
              this.highlightLine(index, true)
            }
            return
          }

          this.selection.update(index)
          this.selection.paint(this.cachedGutterElements)
        }

        const mouseUpHandler = (ev: UIEvent) => {
          ev.preventDefault()

          this.onMouseUp(index)
        }

        if (!this.props.readOnly) {
          reactContainer.addEventListener('mouseenter', mouseEnterHandler)
          reactContainer.addEventListener('mouseleave', mouseLeaveHandler)
          reactContainer.addEventListener('mousemove', mouseMoveHandler)
          reactContainer.addEventListener('mousedown', mouseDownHandler)
          reactContainer.addEventListener('mouseup', mouseUpHandler)
        }

        this.cachedGutterElements.set(index, reactContainer)

        let isIncluded = false
        if (this.props.file instanceof WorkingDirectoryFileChange) {
          isIncluded = this.props.file.selection.isSelected(index)
        }

        ReactDOM.render(
          <DiffLineGutter line={diffLine}
                          readOnly={this.props.readOnly}
                          isIncluded={isIncluded}/>,
          reactContainer)
        element.insertBefore(reactContainer, diffLineElement)

        // Hack(ish?). In order to be a real good citizen we need to unsubscribe from
        // the line delete event once we've been called once or the component has been
        // unmounted. In the latter case it's _probably_ not strictly necessary since
        // the only thing gc rooted by the event should be isolated and eligble for
        // collection. But let's be extra cautious I guess.
        //
        // The only way to unsubscribe is to pass the exact same function given to the
        // 'on' function to the 'off' so we need a reference to ourselves, basically.
        let deleteHandler: () => void

        // Since we manually render a react component we have to take care of unmounting
        // it or else we'll leak memory. This disposable will unmount the component.
        //
        // See https://facebook.github.io/react/blog/2015/10/01/react-render-and-top-level-api.html
        const gutterCleanup = new Disposable(() => {

          this.cachedGutterElements.delete(index)

          if (!this.props.readOnly) {
            reactContainer.removeEventListener('mouseenter', mouseEnterHandler)
            reactContainer.removeEventListener('mouseleave', mouseLeaveHandler)
            reactContainer.removeEventListener('mousedown', mouseDownHandler)
            reactContainer.removeEventListener('mousemove', mouseMoveHandler)
            reactContainer.removeEventListener('mouseup', mouseUpHandler)
          }

          ReactDOM.unmountComponentAtNode(reactContainer)

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

  public onChanges = (cm: Editor) => {
    this.restoreScrollPosition(cm)
  }

  private renderImage(imageDiff: ImageDiff) {
    if (imageDiff.current && imageDiff.previous) {
      return <ModifiedImageDiff
                current={imageDiff.current}
                previous={imageDiff.previous} />
    }

    if (imageDiff.current && this.props.file.status === FileStatus.New) {
      return <NewImageDiff current={imageDiff.current} />
    }

    if (imageDiff.previous && this.props.file.status === FileStatus.Deleted) {
      return <DeletedImageDiff previous={imageDiff.previous} />
    }

    return null
  }

  /**
   * normalize the line endings in the diff so that the CodeMirror Editor
   * will display the unified diff correctly
   */
  private formatLineEnding(text: string): string {
    if (text.endsWith('\n')) {
      return text
    } else if (text.endsWith('\r')) {
      return text + '\n'
    } else {
      return text + '\r\n'
    }
  }

  private getAndStoreCodeMirrorInstance = (cmh: CodeMirrorHost) => {
    this.codeMirror = cmh === null ? null : cmh.getEditor()
  }

  public render() {

    if (this.props.diff.imageDiff) {
      return this.renderImage(this.props.diff.imageDiff)
    }

    if (this.props.diff.isBinary) {
      return <BinaryFile path={this.props.file.path}
                         repository={this.props.repository}
                         dispatcher={this.props.dispatcher} />
    }

    let diffText = ''

    this.props.diff.hunks.forEach(hunk => {
      hunk.lines.forEach(l => diffText += this.formatLineEnding(l.text))
    })

    const options: IEditorConfigurationExtra = {
      lineNumbers: false,
      readOnly: true,
      showCursorWhenSelecting: false,
      cursorBlinkRate: -1,
      lineWrapping: localStorage.getItem('soft-wrap-is-best-wrap') ? true : false,
      // Make sure CodeMirror doesn't capture Tab and thus destroy tab navigation
      extraKeys: { Tab: false },
      scrollbarStyle: __DARWIN__ ? 'simple' : 'native',
      mode: getDiffMode(),
    }

    return (
      <CodeMirrorHost
        className='diff-code-mirror'
        value={diffText}
        options={options}
        isSelectionEnabled={this.isSelectionEnabled}
        onChanges={this.onChanges}
        onRenderLine={this.renderLine}
        ref={this.getAndStoreCodeMirrorInstance}
      />
    )
  }
}
