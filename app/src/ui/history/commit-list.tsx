import * as React from 'react'
import { Commit } from '../../lib/local-git-operations'
import CommitListItem from './commit-list-item'
import List from '../list'
import CommitFacadeListItem from './commit-facade-list-item'
import { Dispatcher, IGitHubUser } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'

const RowHeight = 52

interface ICommitListProps {
  readonly onCommitSelected: (commit: Commit) => void
  readonly onScroll: (start: number, end: number) => void
  readonly history: ReadonlyArray<string>
  readonly commits: Map<string, Commit>
  readonly selectedSHA: string | null
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, string>
}

/** A component which displays the list of commits. */
export default class CommitList extends React.Component<ICommitListProps, void> {
  private list: List | null

  private renderCommit(row: number) {
    const sha = this.props.history[row]
    const commit = this.props.commits.get(sha)
    if (commit) {
      const gitHubUser = this.props.gitHubUsers.get(commit.authorEmail.toLowerCase()) || null
      return <CommitListItem key={commit.sha} commit={commit} gitHubUser={gitHubUser} emoji={this.props.emoji}/>
    } else {
      return <CommitFacadeListItem key={row}/>
    }
  }

  private onRowSelected(row: number) {
    const sha = this.props.history[row]
    const commit = this.props.commits.get(sha)
    if (commit) {
      this.props.onCommitSelected(commit)
    }
  }

  private onScroll(scrollTop: number, clientHeight: number) {
    const numberOfRows = Math.ceil(clientHeight / RowHeight)
    const top = Math.floor(scrollTop / RowHeight)
    const bottom = top + numberOfRows
    this.props.onScroll(top, bottom)
  }

  private rowForSHA(sha_: string | null): number {
    const sha = sha_
    if (!sha) { return -1 }

    return this.props.history.findIndex(s => s === sha)
  }

  public forceUpdate() {
    super.forceUpdate()

    const list = this.list
    if (list) {
      list.forceUpdate()
    }
  }

  public render() {
    return (
      <div className='panel' id='commit-list'>
        <List ref={ref => this.list = ref}
              rowCount={this.props.history.length}
              rowHeight={RowHeight}
              selectedRow={this.rowForSHA(this.props.selectedSHA)}
              rowRenderer={row => this.renderCommit(row)}
              onRowSelected={row => this.onRowSelected(row)}
              onScroll={(scrollTop, clientHeight) => this.onScroll(scrollTop, clientHeight)}
              invalidationProps={{ commits: this.props.commits, gitHubUsers: this.props.gitHubUsers }}/>
      </div>
    )
  }
}
