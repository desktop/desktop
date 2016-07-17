import * as React from 'react'
import {Commit} from '../../lib/local-git-operations'
import CommitListItem from './commit-list-item'
import List from '../list'

interface ICommitListProps {
  readonly onCommitSelected: (commit: Commit) => void
  readonly commits: ReadonlyArray<Commit>
  readonly selectedCommit: Commit | null
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
      <div id='commit-list'>
        <List itemCount={this.props.commits.length}
              itemHeight={44}
              selectedRow={this.rowForCommit(this.props.selectedCommit)}
              renderItem={row => this.renderCommit(row)}
              onSelectionChanged={row => this.onSelectionChanged(row)}/>
      </div>
    )
  }
}
