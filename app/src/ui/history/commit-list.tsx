import * as React from 'react'
import { Commit } from '../../lib/local-git-operations'
import CommitListItem from './commit-list-item'
import List from '../list'
import CommitFacadeListItem from './commit-facade-list-item'
import { findIndex } from '../../lib/find'
import { Dispatcher, IGitHubUser } from '../../lib/dispatcher'
import Repository from '../../models/repository'

const RowHeight = 68

const DefaultGitHubUser: IGitHubUser = {
  endpoint: '',
  email: '',
  login: null,
  avatarURL: 'https://github.com/hubot.png',
}

interface ICommitListProps {
  readonly onCommitSelected: (commit: Commit) => void
  readonly onScroll: (start: number, end: number) => void
  readonly commits: ReadonlyArray<Commit>
  readonly selectedCommit: Commit | null
  readonly commitCount: number
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly repository: Repository
  readonly dispatcher: Dispatcher
}

/** A component which displays the list of commits. */
export default class CommitList extends React.Component<ICommitListProps, void> {
  private list: List | null

  private renderCommit(row: number) {
    const commit: Commit | null = this.props.commits[row]
    if (commit) {
      let gitHubUser = this.props.gitHubUsers.get(commit.authorEmail)
      if (!gitHubUser) {
        gitHubUser = DefaultGitHubUser
      }

      return <CommitListItem key={commit.sha} commit={commit} gitHubUser={gitHubUser}/>
    } else {
      return <CommitFacadeListItem key={row}/>
    }
  }

  private onSelectionChanged(row: number) {
    const commit = this.props.commits[row]
    this.props.onCommitSelected(commit)
  }

  private onScroll(scrollTop: number, clientHeight: number) {
    const numberOfRows = Math.ceil(clientHeight / RowHeight)
    const top = Math.floor(scrollTop / RowHeight)
    const bottom = top + numberOfRows
    this.props.onScroll(top, bottom)
  }

  private rowForCommit(commit_: Commit | null): number {
    const commit = commit_
    if (!commit) { return -1 }

    return findIndex(this.props.commits, c => c.sha === commit.sha)
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
              rowCount={this.props.commitCount}
              rowHeight={RowHeight}
              selectedRow={this.rowForCommit(this.props.selectedCommit)}
              rowRenderer={row => this.renderCommit(row)}
              onSelectionChanged={row => this.onSelectionChanged(row)}
              onScroll={(scrollTop, clientHeight) => this.onScroll(scrollTop, clientHeight)}
              invalidationProps={{ commits: this.props.commits, gitHubUsers: this.props.gitHubUsers }}/>
      </div>
    )
  }
}
