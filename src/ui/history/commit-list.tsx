import * as React from 'react'
import {Commit} from '../../lib/local-git-operations'
import {default as CommitView} from './commit'
import List from '../list'

interface ICommitListProps {
  onSelectionChanged: (row: number) => void
  commits: Commit[]
  selectedRow: number
}

export default class CommitList extends React.Component<ICommitListProps, void> {
  private renderCommit(row: number) {
    const commit = this.props.commits[row]
    return <CommitView commit={commit} key={commit.getSHA()}/>
  }

  public render() {
    return (
      <div id='commit-list'>
        <List itemCount={this.props.commits.length}
              itemHeight={44}
              selectedRow={this.props.selectedRow}
              renderItem={row => this.renderCommit(row)}
              onSelectionChanged={row => this.props.onSelectionChanged}/>
      </div>
    )
  }
}
