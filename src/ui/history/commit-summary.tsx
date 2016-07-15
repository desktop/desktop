import * as React from 'react'
import {IFileStatus} from '../../lib/local-git-operations'

interface ICommitSummaryProps {
  summary: string
  body: string
  files: ReadonlyArray<IFileStatus>
}

export default class CommitSummary extends React.Component<ICommitSummaryProps, void> {
  public render() {
    return (
      <div>
        <div>{this.props.summary}</div>
        <div>&nbsp;</div>
        <div>{this.props.body}</div>
        <ul>
          {this.props.files.map(f => <li key={f.name}>{f.name}</li>)}
        </ul>
      </div>
    )
  }
}
