import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Disposable, CompositeDisposable } from 'event-kit'

import { EditorConfiguration } from 'codemirror'
import { CodeMirrorHost } from './code-mirror-host'
import { Repository } from '../../models/repository'
import { FileChange, WorkingDirectoryFileChange } from '../../models/status'
import { DiffSelectionType, DiffLine, Diff as DiffModel, DiffLineType, DiffHunk } from '../../models/diff'
import { assertNever } from '../../lib/fatal-error'

import { LocalGitOperations, Commit } from '../../lib/local-git-operations'

import { DiffLineGutter } from './diff-line-gutter'

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
  readonly file: FileChange | null

  /** The commit which contains the diff to display. */
  readonly commit: Commit | null

  /** Called when the includedness of lines or hunks has changed. */
  readonly onIncludeChanged?: (diffSelection: Map<number, boolean>) => void
}

interface IDiffState {
  readonly diff: DiffModel
}

/** A component which renders a diff for a file. */
export class Diff extends React.Component<IDiffProps, IDiffState> {
  /**
   * The disposable that should be disposed of when the instance is unmounted.
   * This will be null when our CodeMirror instance hasn't been set up yet.
   */
  private codeMirrorDisposables: CompositeDisposable | null = null

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

  public constructor(props: IDiffProps) {
    super(props)

    this.state = { diff: new DiffModel([]) }
  }

  public componentWillReceiveProps(nextProps: IDiffProps) {
    this.loadDiff(nextProps.repository, nextProps.file, nextProps.commit)
  }

  public componentWillUnmount() {
    this.dispose()
  }

  private dispose() {
    const disposables = this.codeMirrorDisposables
    if (disposables) {
      disposables.dispose()
    }

    this.codeMirrorDisposables = null
    this.codeMirror = null

    this.lineCleanup.forEach((disposable) => disposable.dispose())
    this.lineCleanup.clear()
  }

  private async loadDiff(repository: Repository, file: FileChange | null, commit: Commit | null) {
    if (!file) {
      // clear whatever existing state
      this.setState({ diff: new DiffModel([]) })
      return
    }

    // If we're reloading the same file, we want to save the current scroll
    // position and restore it after the diff's been updated.
    const sameFile = file && this.props.file && file.id === this.props.file.id
    const codeMirror = this.codeMirror
    if (codeMirror && sameFile) {
      const scrollInfo = codeMirror.getScrollInfo()
      this.scrollPositionToRestore = { left: scrollInfo.left, top: scrollInfo.top }
    } else {
      this.scrollPositionToRestore = null
    }

    const sameCommit = commit && this.props.commit && commit.sha === this.props.commit.sha
    // If it's the same file and commit, we don't need to reload. Ah the joys of
    // immutability.
    if (sameFile && sameCommit) { return }

    const diff = await LocalGitOperations.getDiff(repository, file, commit)

    if (file instanceof WorkingDirectoryFileChange) {
      const diffSelection = file.selection
      const selectionType = diffSelection.getSelectionType()

      if (selectionType === DiffSelectionType.Partial) {
        diffSelection.selectedLines.forEach((value, index) => {
          const hunk = this.diffHunkForIndex(diff, index)
          if (hunk) {
            const relativeIndex = index - hunk.unifiedDiffStart
            const diffLine = hunk.lines[relativeIndex]
            if (diffLine) {
              diffLine.selected = value
            }
          }
        })
      } else {
        const includeAll = selectionType === DiffSelectionType.All ? true : false
        diff.setAllLines(includeAll)
      }
    }

    this.setState({ diff })
  }

  private diffHunkForIndex(diff: DiffModel, index: number): DiffHunk | null {
    const hunk = diff.hunks.find(h => {
      return index >= h.unifiedDiffStart && index <= h.unifiedDiffEnd
    })
    return hunk || null
  }

  private getClassName(type: DiffLineType): string {
    switch (type) {
      case DiffLineType.Add: return 'diff-add'
      case DiffLineType.Delete: return 'diff-delete'
      case DiffLineType.Context: return 'diff-context'
      case DiffLineType.Hunk: return 'diff-hunk'
    }

    return assertNever(type, `Unknown DiffLineType ${type}`)
  }

  private onIncludeChanged(line: DiffLine, rowIndex: number) {
    if (!this.props.onIncludeChanged) {
      return
    }

    const startLine = rowIndex
    const endLine = startLine

    if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
      console.error('cannot change selected lines when selected file is not a WorkingDirectoryFileChange')
      return
    }

    const newDiffSelection = new Map<number, boolean>()

    // populate the current state of the diff
    this.state.diff.hunks.forEach(hunk => {
      hunk.lines.forEach((line, index) => {
        if (line.type === DiffLineType.Add || line.type === DiffLineType.Delete) {
          const absoluteIndex = hunk.unifiedDiffStart + index
          newDiffSelection.set(absoluteIndex, line.selected)
        }
      })
    })

    const include = !line.selected

    // apply the requested change
    for (let i = startLine; i <= endLine; i++) {
      newDiffSelection.set(i, include)
    }

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
    const hunk = this.diffHunkForIndex(this.state.diff, index)
    if (hunk) {
      const relativeIndex = index - hunk.unifiedDiffStart
      const diffLine = hunk.lines[relativeIndex]
      if (diffLine) {
        const diffLineElement = element.children[0] as HTMLSpanElement

        const reactContainer = document.createElement('span')
        ReactDOM.render(
          <DiffLineGutter line={diffLine} readOnly={this.props.readOnly} onIncludeChanged={line => this.onIncludeChanged(line, index)}/>,
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

        element.classList.add(this.getClassName(diffLine.type))
      }
    }
  }

  private restoreScrollPosition() {
    const codeMirror = this.codeMirror
    const scrollPosition = this.scrollPositionToRestore
    if (codeMirror && scrollPosition) {
      this.codeMirror.scrollTo(scrollPosition.left, scrollPosition.top)
    }
  }

  public onChanges = () => {
    this.restoreScrollPosition()
  }

  public render() {
    const file = this.props.file
    if (!file) {
      return (
        <div className='panel blankslate' id='diff'>
          No file selected
        </div>
      )
    }

    const invalidationProps = { path: file.path, selection: DiffSelectionType.None }
    if (file instanceof WorkingDirectoryFileChange) {
      invalidationProps.selection = file.selection.getSelectionType()
    }

    let diffText = ''

    this.state.diff.hunks.forEach(hunk => {
      hunk.lines.forEach(l => diffText += l.text + '\r\n')
    })

    const options: EditorConfiguration = {
      lineNumbers: false,
      readOnly: true,
      showCursorWhenSelecting: false,
      cursorBlinkRate: -1,
      lineWrapping: localStorage.getItem('soft-wrap-is-best-wrap') ? true : false,
    }

    /*

      className='diff-code-mirror'
      value={diffText}
      options={options}
      onChanges={this.onChanges}
    */

    return (
      <div className='panel' id='diff'>
        <CodeMirrorHost
          value={diffText}
          options={options}
          onChanges={this.onChanges}
          onRenderLine={this.renderLine}
        />
      </div>
    )
  }
}
