import * as React from 'react'
import { Commit } from '../../lib/local-git-operations'
import CommitListItem from './commit-list-item'
import List from '../list'

interface ICommitListProps {
  readonly onCommitSelected: (commit: Commit) => void
  readonly commits: ReadonlyArray<Commit>
  readonly selectedCommit: Commit | null
  readonly commitCount: number
}

/** A component which displays the list of commits. */
export default class CommitList extends React.Component<ICommitListProps, void> {
  private renderCommit(row: number) {
    const commit = this.props.commits[row]
    return <CommitListItem commit={commit} key={commit.sha}/>
  }

  private onSelectionChanged(row: number) {
    const commit = this.props.commits[row]
    this.props.onCommitSelected(commit)
  }

  private rowForCommit(commit_: Commit | null): number {
    const commit = commit_
    if (!commit) { return -1 }

    let index = 0
    this.props.commits.forEach((c, i) => {
      if (c.sha === commit.sha) {
        index = i
        return
      }
    })
    return index
  }

  public render() {
    return (
      <div className='panel' id='commit-list'>
        <List rowCount={this.props.commitCount}
              rowHeight={68}
              selectedRow={this.rowForCommit(this.props.selectedCommit)}
              rowRenderer={row => this.renderCommit(row)}
              onSelectionChanged={row => this.onSelectionChanged(row)}/>
      </div>
    )
  }
}
