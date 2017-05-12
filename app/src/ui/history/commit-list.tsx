import * as React from 'react'
import { Commit } from '../../models/commit'
import { CommitListItem } from './commit-list-item'
import { List } from '../list'
import { IGitHubUser } from '../../lib/dispatcher'

const RowHeight = 48

interface ICommitListProps {
  readonly onCommitChanged: (commit: Commit) => void
  readonly onScroll: (start: number, end: number) => void
  readonly history: ReadonlyArray<string>
  readonly commits: Map<string, Commit>
  readonly selectedSHA: string | null
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
}

/** A component which displays the list of commits. */
export class CommitList extends React.Component<ICommitListProps, void> {
  private list: List | null

  private renderCommit = (row: number) => {
    const sha = this.props.history[row]
    const commit = this.props.commits.get(sha)
    if (!commit) {
      return null
    }

    const gitHubUser = this.props.gitHubUsers.get(commit.author.email.toLowerCase()) || null
    let avatarUser = null
    if (gitHubUser) {
      avatarUser = { ...commit.author, avatarURL: gitHubUser.avatarURL }
    }

    return <CommitListItem key={commit.sha} commit={commit} user={avatarUser} emoji={this.props.emoji}/>
  }

  private onRowChanged = (row: number) => {
    const sha = this.props.history[row]
    const commit = this.props.commits.get(sha)
    if (commit) {
      this.props.onCommitChanged(commit)
    }
  }

  private onScroll = (scrollTop: number, clientHeight: number) => {
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

  private onListRef = (ref: List) => {
    this.list = ref
  }

  public render() {

    if (this.props.history.length === 0) {
      return (
        <div className='panel blankslate'>
          No history
        </div>
      )
    }

    return (
      <div id='commit-list'>
        <List ref={this.onListRef}
              rowCount={this.props.history.length}
              rowHeight={RowHeight}
              selectedRow={this.rowForSHA(this.props.selectedSHA)}
              rowRenderer={this.renderCommit}
              onSelectionChanged={this.onRowChanged}
              onScroll={this.onScroll}
              invalidationProps={{
                history: this.props.history,
                gitHubUsers: this.props.gitHubUsers,
              }}
            />
      </div>
    )
  }
}
