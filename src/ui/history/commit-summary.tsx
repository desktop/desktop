import * as React from 'react'
import {IFileStatus} from '../../lib/local-git-operations'
import List from '../list'

interface ICommitSummaryProps {
  readonly summary: string
  readonly body: string
  readonly files: ReadonlyArray<IFileStatus>
}

export default class CommitSummary extends React.Component<ICommitSummaryProps, void> {
  private renderFile(row: number) {
    const file = this.props.files[row]
    return <div key={file.name}>{file.name}</div>
  }

  public render() {
    return (
      <div>
        <div>{this.props.summary}</div>
        <div>&nbsp;</div>
        <div>{this.props.body}</div>
        <List renderItem={row => this.renderFile(row)}
              itemCount={this.props.files.length}
              itemHeight={22}
              selectedRow={-1}/>
      </div>
    )
  }
}
