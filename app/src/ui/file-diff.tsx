import * as React from 'react'

import List from './list'
import FileDiffLine from './file-diff-line'

import IRepository from '../models/repository'
import { FileChange } from '../models/status'

import { LocalGitOperations, Diff, Commit } from '../lib/local-git-operations'

const RowHeight = 20

interface IFileDiffProps {
  readonly repository: IRepository
  readonly readOnly: boolean
  readonly file: FileChange | null
  readonly commit: Commit | null
}

interface IFileDiffState {
  readonly diff: Diff
}

export default class FileDiff extends React.Component<IFileDiffProps, IFileDiffState> {

  public constructor(props: IFileDiffProps) {
    super(props)

    this.state = { diff: new Diff([]) }
  }

  public componentWillReceiveProps(nextProps: IFileDiffProps) {
    this.renderDiff(nextProps.repository, nextProps.file, nextProps.readOnly)
  }

  private async renderDiff(repository: IRepository, file: FileChange | null, readOnly: boolean) {
    if (!file) {
      // TOOD: don't render anything
    } else {

      const diff = await LocalGitOperations.getDiff(repository, file, this.props.commit)

      this.setState(Object.assign({}, this.state, { diff }))
    }
  }

  private renderRow(row: number): JSX.Element {
    const line = this.state.diff.lines[row]
    const id = `${this.props.file!.path} ${row}`

    return (
      <FileDiffLine text={line.text}
                    type={line.type}
                    oldLineNumber={line.oldLineNumber}
                    newLineNumber={line.newLineNumber}
                    key={id} />
    )
  }

  public render() {

    if (this.props.file) {
      return (
        <div className='panel border-top' id='file-diff'>
          <List id='diff-text'
                itemCount={this.state.diff.lines.length}
                itemHeight={RowHeight}
                renderItem={row => this.renderRow(row)}
                selectedRow={-1} />
        </div>
      )
    } else {
      return (
        <div className='panel border-top blankslate' id='file-diff'>
          <p className='f3-light'>No file selected</p>
        </div>
      )
    }
  }
}
