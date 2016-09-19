import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as CodeMirror from 'react-codemirror'
import { Disposable, CompositeDisposable } from 'event-kit'

/** These are required for their side effects :((( */
require('codemirror/mode/javascript/javascript')
require('codemirror/addon/scroll/simplescrollbars')

import IRepository from '../../models/repository'
import { FileChange, WorkingDirectoryFileChange } from '../../models/status'
import { DiffSelectionType, DiffLine, Diff, DiffLineType } from '../../models/diff'

import { LocalGitOperations, Commit } from '../../lib/local-git-operations'

import DiffLineGutter from './diff-line-gutter'

/** This class name *must* match the one in `_file-diff.scss`. */
const DiffGutterClassName = 'diff-gutter'

interface IFileDiffProps {
  readonly repository: IRepository
  readonly readOnly: boolean
  readonly file: FileChange | null
  readonly commit: Commit | null
  readonly onIncludeChanged?: (diffSelection: Map<number, boolean>) => void
}

interface IFileDiffState {
  readonly diff: Diff
}

export default class FileDiff extends React.Component<IFileDiffProps, IFileDiffState> {
  /** Have we initialized our CodeMirror editor? This should only happen once. */
  private initializedCodeMirror = false

  private editor: React.Component<any, any> | null

  private disposables: CompositeDisposable | null = null

  public constructor(props: IFileDiffProps) {
    super(props)

    this.state = { diff: new Diff([]) }
  }

  public componentWillReceiveProps(nextProps: IFileDiffProps) {
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
      this.setState({ diff: new Diff([]) })
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

  private drawGutter = () => {
    const editor: any = this.editor
    if (!editor) {
      return
    }

    const codeMirror: any = editor.getCodeMirror()
    if (!codeMirror) {
      console.log('unable to draw')
      return
    }

    this.state.diff.sections.forEach(section => {
      section.lines.forEach((line, index) => {
        const absoluteIndex = section.unifiedDiffStart + index
        const marker = document.createElement('div')
        ReactDOM.render(
          <DiffLineGutter line={line} onIncludeChanged={line => this.onIncludeChanged(line, absoluteIndex)}/>
        , marker)
        codeMirror.setGutterMarker(absoluteIndex, DiffGutterClassName, marker)
      })
    })
  }

  private renderLine = (instance: any, line: any, element: any) => {
    const index = instance.getLineNumber(line)
    const section = this.state.diff.sections.find(s => {
      return index >= s.unifiedDiffStart && index < s.unifiedDiffEnd
    })

    if (section) {
      const relativeIndex = index - section.unifiedDiffStart
      const diffLine = section.lines[relativeIndex]
      if (diffLine) {
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

      codeMirror.on('changes', this.drawGutter)
      codeMirror.on('renderLine', this.renderLine)

      disposables.add(new Disposable(() => {
        codeMirror.off('changes', this.drawGutter)
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
        mode: 'javascript',
        theme: 'solarized',
        showCursorWhenSelecting: false,
        cursorBlinkRate: -1,
        styleActiveLine: false,
        scrollbarStyle: 'simple',
        gutters: [ DiffGutterClassName ],
    }

    return (
      <div className='panel' id='file-diff'>
        <CodeMirror
          value={diffText}
          options={options}
          ref={(ref: React.Component<any, any>) => this.styleEditor(ref)}/>
      </div>
    )
  }
}
