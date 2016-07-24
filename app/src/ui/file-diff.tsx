import * as React from 'react'

import List from './list'
import FileDiffLine from './file-diff-line'

import IRepository from '../models/repository'

import { LocalGitOperations, Diff, Commit } from '../lib/local-git-operations'

const RowHeight = 20

interface IFileDiffProps {
  readonly repository: IRepository
  readonly readOnly: boolean
  readonly relativePath: string | null
  readonly commit: Commit | null
}

interface IFileDiffState {
  readonly diff: Diff
  readonly lines: string[]
}

export default class FileDiff extends React.Component<IFileDiffProps, IFileDiffState> {

  public constructor(props: IFileDiffProps) {
    super(props)

    this.state = { diff: new Diff([]), lines: [] }
  }

  public componentWillReceiveProps(nextProps: IFileDiffProps) {
    this.renderDiff(nextProps.repository, nextProps.relativePath, nextProps.readOnly)
  }

  private async renderDiff(repository: IRepository, relativePath: string | null, readOnly: boolean) {
    if (!relativePath) {
      // TOOD: don't render anything
    } else {

      const diff = await LocalGitOperations.getDiff(repository, relativePath, this.props.commit)

      let lines: string[] = []
      diff.sections.forEach(s => {
        s.lines.forEach(l => lines.push(l))
      })

      this.setState(Object.assign({}, this.state, { diff, lines }))
    }
  }

  private renderRow(row: number): JSX.Element {
    const text = this.state.lines[row]
    const id = `${this.props.relativePath} ${row}`

    return (
      <FileDiffLine text={text}
                    key={id} />
    )
  }

  public render() {

    if (this.props.relativePath) {
      return (
        <div id='file-diff'>
          <List id='diff-text'
                itemCount={this.state.lines.length}
                itemHeight={RowHeight}
                renderItem={row => this.renderRow(row)}
                selectedRow={-1} />
        </div>)
    } else {
      return <div id='file-diff'>No file selected</div>
    }
  }
}
