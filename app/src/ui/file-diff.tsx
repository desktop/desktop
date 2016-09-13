import * as React from 'react'

import IRepository from '../models/repository'
import { FileChange, WorkingDirectoryFileChange } from '../models/status'
import { DiffSelectionType, Diff } from '../models/diff'

import { LocalGitOperations, Commit } from '../lib/local-git-operations'

var Codemirror = require('react-codemirror');

require('codemirror/mode/javascript/javascript');
require('codemirror/addon/scroll/simplescrollbars');

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

  private editor: React.Component<any, any> | null

  public constructor(props: IFileDiffProps) {
    super(props)

    this.state = { diff: new Diff([]) }
  }

  public componentWillReceiveProps(nextProps: IFileDiffProps) {
    this.renderDiff(nextProps.repository, nextProps.file, nextProps.readOnly)
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

    this.setState(Object.assign({}, this.state, { diff }))
  }

  private createElement(number: number): HTMLDivElement {
    var marker = document.createElement('div');
    marker.className = 'diff-line-number'
    marker.innerHTML = number.toString();
    return marker;
  }

  private drawGutter() {

    const elem: any = this.editor

    if (!elem) {
      return
    }

    const cm: any = elem.getCodeMirror()

    if (!cm) {
      console.log('unable to draw')
      return
    }

    this.state.diff.sections.forEach(s => {
      s.lines.forEach((l, index) => {

        const absoluteIndex = s.unifiedDiffStart + index
        const info = cm.lineInfo(absoluteIndex)

        if (info) {
          if (l.oldLineNumber) {
            cm.setGutterMarker(absoluteIndex, 'before', this.createElement(l.oldLineNumber))
          }
          if (l.newLineNumber) {
            cm.setGutterMarker(absoluteIndex, 'after', this.createElement(l.newLineNumber))
          }
        } else {
          console.log(`no line found at ${absoluteIndex}`)
        }
      })
    })
  }

  private styleEditor(ref: React.Component<any,any>) {
    this.editor = ref

    const elem: any = this.editor

    if (elem) {
      const cm: any = elem.getCodeMirror()

      if (!cm) {
        return
      }

      cm.on('change', this.drawGutter.bind(this))
    }
  }

  public render() {

    const file = this.props.file
    if (file) {

      const invalidationProps = { path: file.path, selection: DiffSelectionType.None }
      if (file instanceof WorkingDirectoryFileChange) {
        invalidationProps.selection = file.selection.getSelectionType()
      }

      let diffText = ''

      this.state.diff.sections.forEach(s => {
        s.lines.forEach(l => diffText += l.text + '\r\n')
      })

      var options = {
          lineNumbers: false,
          readOnly: true,
          mode: 'javascript',
          theme: 'solarized',
          showCursorWhenSelecting: false,
          styleActiveLine: false,
          scrollbarStyle: "simple",
          gutters: [ 'before', 'after' ]
      };

      return (
        <div className='panel' id='file-diff'>
          <Codemirror
            value={diffText}
            options={options}
            ref={(ref: React.Component<any, any>) => this.styleEditor(ref)}/>
        </div>
      )
    } else {
      return (
        <div className='panel blankslate' id='file-diff'>
          No file selected
        </div>
      )
    }
  }
}
