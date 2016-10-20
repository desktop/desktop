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
import { DiffLine, Diff as DiffModel, DiffSelection, ImageDiff } from '../../models/diff'
import { Dispatcher } from '../../lib/dispatcher/dispatcher'

import { DiffLineGutter } from './diff-line-gutter'
import { IEditorConfigurationExtra } from './editor-configuration-extra'
import { getDiffMode } from './diff-mode'

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

  private onMouseMove(index: Number) {
    console.log(`mouse move: ${index}`)
  }

  private onMouseDown(index: Number) {
    console.log(`mouse down: ${index}`)
  }

  private onMouseUp(index: Number) {
    console.log(`mouse up: ${index}`)
  }

  private onIncludeChanged(line: DiffLine, rowIndex: number) {
    if (!this.props.onIncludeChanged) {
      return
    }

    if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
      console.error('cannot change selected lines when selected file is not a WorkingDirectoryFileChange')
      return
    }

    const newDiffSelection = this.props.file.selection.withToggleLineSelection(rowIndex)

    this.props.onIncludeChanged(newDiffSelection)
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
        let isIncluded = false
        const file = this.props.file

        if (file instanceof WorkingDirectoryFileChange) {
          isIncluded = file.selection.isSelected(index)
        }

        const diffLineElement = element.children[0] as HTMLSpanElement

        const reactContainer = document.createElement('span')

        const mouseDownHandler = () => {
           if (this.onMouseDown) {
             this.onMouseDown(index)
           }
        }

        const mouseMoveHandler = () => {
           if (this.onMouseMove) {
             this.onMouseMove(index)
           }
        }

        const mouseUpHandler = () => {
           if (this.onMouseUp) {
             this.onMouseUp(index)
           }
        }

        reactContainer.addEventListener('mousemove', mouseMoveHandler)
        reactContainer.addEventListener('mousedown', mouseDownHandler)
        reactContainer.addEventListener('mouseup', mouseUpHandler)

        ReactDOM.render(
          <DiffLineGutter line={diffLine}
                          readOnly={this.props.readOnly}
                          onIncludeChanged={line => this.onIncludeChanged(line, index)}
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

          reactContainer.removeEventListener('mousedown', mouseDownHandler)
          reactContainer.removeEventListener('mousemove', mouseMoveHandler)
          reactContainer.removeEventListener('mouseup', mouseUpHandler)

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
      hunk.lines.forEach(l => diffText += l.text + '\r\n')
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
      <div className='panel' id='diff'>
        <CodeMirrorHost
          className='diff-code-mirror'
          value={diffText}
          options={options}
          onChanges={this.onChanges}
          onRenderLine={this.renderLine}
          ref={(cmh) => { this.codeMirror = cmh === null ? null : cmh.getEditor() }}
        />
      </div>
    )
  }
}
