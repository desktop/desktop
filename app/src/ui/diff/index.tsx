import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as CodeMirror from 'react-codemirror'
import { Disposable, CompositeDisposable } from 'event-kit'

/** Required for its side effects :((( */
require('codemirror/addon/scroll/simplescrollbars')

import IRepository from '../../models/repository'
import { FileChange, WorkingDirectoryFileChange } from '../../models/status'
import { DiffSelectionType, DiffLine, Diff as DiffModel, DiffLineType } from '../../models/diff'

import { LocalGitOperations, Commit } from '../../lib/local-git-operations'

import DiffLineGutter from './diff-line-gutter'

interface IDiffProps {
  readonly repository: IRepository
  readonly readOnly: boolean
  readonly file: FileChange | null
  readonly commit: Commit | null
  readonly onIncludeChanged?: (diffSelection: Map<number, boolean>) => void
}

interface IDiffState {
  readonly diff: DiffModel
}

export default class Diff extends React.Component<IDiffProps, IDiffState> {
  /** Have we initialized our CodeMirror editor? This should only happen once. */
  private initializedCodeMirror = false

  private editor: React.Component<any, any> | null

  private disposables: CompositeDisposable | null = null

  public constructor(props: IDiffProps) {
    super(props)

    this.state = { diff: new DiffModel([]) }
  }

  public componentWillReceiveProps(nextProps: IDiffProps) {
    this.dispose()

    this.renderDiff(nextProps.repository, nextProps.file, nextProps.readOnly)
  }

  public componentWillUnmount() {
    this.dispose()
  }

  private dispose() {
    const disposables = this.disposables
    if (disposables) {
      disposables.dispose()
    }

    this.disposables = null
  }

  private async renderDiff(repository: IRepository, file: FileChange | null, readOnly: boolean) {
    if (!file) {
      // clear whatever existing state
      this.setState({ diff: new DiffModel([]) })
      return
    }

    const diff = await LocalGitOperations.getDiff(repository, file, this.props.commit)

    if (file instanceof WorkingDirectoryFileChange) {
      const diffSelection = file.selection
      const selectionType = diffSelection.getSelectionType()

      if (selectionType === DiffSelectionType.Partial) {
        diffSelection.selectedLines.forEach((value, index) => {
          const section = diff.sections.find(s => {
            return index >= s.unifiedDiffStart && index < s.unifiedDiffEnd
          })

          if (section) {
            const relativeIndex = index - section.unifiedDiffStart
            const diffLine = section.lines[relativeIndex]
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

  private getClassName(type: DiffLineType): string {
    if (type === DiffLineType.Add) {
      return 'diff-add'
    } else if (type === DiffLineType.Delete) {
      return 'diff-delete'
    } else if (type === DiffLineType.Context) {
      return 'diff-hunk'
    } else {
      return 'diff-context'
    }
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
    this.state.diff.sections.forEach(s => {
      s.lines.forEach((line, index) => {
        if (line.type === DiffLineType.Add || line.type === DiffLineType.Delete) {
          const absoluteIndex = s.unifiedDiffStart + index
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

  private renderLine = (instance: any, line: any, element: HTMLElement) => {
    const index = instance.getLineNumber(line)
    const section = this.state.diff.sections.find(s => {
      return index >= s.unifiedDiffStart && index < s.unifiedDiffEnd
    })

    if (section) {
      const relativeIndex = index - section.unifiedDiffStart
      const diffLine = section.lines[relativeIndex]
      if (diffLine) {
        const diffLineElement = element.children[0] as HTMLSpanElement

        const reactContainer = document.createElement('span')
        ReactDOM.render(
          <DiffLineGutter line={diffLine} readOnly={this.props.readOnly} onIncludeChanged={line => this.onIncludeChanged(line, index)}/>,
        reactContainer)
        element.insertBefore(reactContainer, diffLineElement)

        element.classList.add(this.getClassName(diffLine.type))
      }
    }
  }

  private styleEditor(ref: React.Component<any, any>) {
    this.editor = ref

    const editor: any = this.editor
    if (editor && !this.initializedCodeMirror) {
      const codeMirror: any = editor.getCodeMirror()
      if (!codeMirror) {
        return
      }

      this.initializedCodeMirror = true

      this.dispose()

      const disposables = new CompositeDisposable()
      this.disposables = disposables

      codeMirror.on('renderLine', this.renderLine)

      disposables.add(new Disposable(() => {
        codeMirror.off('renderLine', this.renderLine)

        this.initializedCodeMirror = false
      }))
    }
  }

  public render() {
    const file = this.props.file
    if (!file) {
      return (
        <div className='panel blankslate' id='file-diff'>
          No file selected
        </div>
      )
    }

    const invalidationProps = { path: file.path, selection: DiffSelectionType.None }
    if (file instanceof WorkingDirectoryFileChange) {
      invalidationProps.selection = file.selection.getSelectionType()
    }

    let diffText = ''

    this.state.diff.sections.forEach(s => {
      s.lines.forEach(l => diffText += l.text + '\r\n')
    })

    const options = {
      lineNumbers: false,
      readOnly: true,
      showCursorWhenSelecting: false,
      cursorBlinkRate: -1,
      styleActiveLine: false,
      scrollbarStyle: 'simple',
    }

    return (
      <div className='panel' id='file-diff'>
        <CodeMirror
          className='diff-text'
          value={diffText}
          options={options}
          ref={(ref: React.Component<any, any>) => this.styleEditor(ref)}/>
      </div>
    )
  }
}
