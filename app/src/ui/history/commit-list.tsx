import * as React from 'react'
import { GitHubRepository } from '../../models/github-repository'
import { Commit } from '../../models/commit'
import { CommitListItem } from './commit-list-item'
import { List } from '../lib/list'
import { IGitHubUser } from '../../lib/databases'

const RowHeight = 50

interface ICommitListProps {
  /** The GitHub repository associated with this commit (if found) */
  readonly gitHubRepository: GitHubRepository | null

  /** The list of commits SHAs to display, in order. */
  readonly commitSHAs: ReadonlyArray<string>

  /** The commits loaded, keyed by their full SHA. */
  readonly commitLookup: Map<string, Commit>

  /** The SHA of the selected commit */
  readonly selectedSHA: string | null

  /** The lookup for GitHub users related to this repository */
  readonly gitHubUsers: Map<string, IGitHubUser>

  /** The emoji lookup to render images inline */
  readonly emoji: Map<string, string>

  /** The list of known local commits for the current branch */
  readonly localCommitSHAs: ReadonlyArray<string>

  /** The message to display inside the list when no results are displayed */
  readonly emptyListMessage: JSX.Element | string

  /** Callback which fires when a commit has been selected in the list */
  readonly onCommitSelected: (commit: Commit) => void

  /** Callback that fires when a scroll event has occurred */
  readonly onScroll: (start: number, end: number) => void

  /** Callback to fire to revert a given commit in the current repository */
  readonly onRevertCommit: (commit: Commit) => void

  /** Callback to fire to reset head of a branch to a commit in the current repository */
  readonly onResetHeadToCommit: (commit: Commit) => void

  /** Callback to fire to open a given commit on GitHub */
  readonly onViewCommitOnGitHub: (sha: string) => void
}

/** A component which displays the list of commits. */
export class CommitList extends React.Component<ICommitListProps, {}> {
  private renderCommit = (row: number) => {
    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)

    if (commit == null) {
      if (__DEV__) {
        log.warn(
          `[CommitList]: the commit '${sha}' does not exist in the cache`
        )
      }
      return null
    }

    const isLocal = this.props.localCommitSHAs.indexOf(commit.sha) > -1

    return (
      <CommitListItem
        key={commit.sha}
        gitHubRepository={this.props.gitHubRepository}
        isLocal={isLocal}
        commit={commit}
        gitHubUsers={this.props.gitHubUsers}
        emoji={this.props.emoji}
        onRevertCommit={this.props.onRevertCommit}
        onResetHeadToCommit={this.props.onResetHeadToCommit}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
      />
    )
  }

  private onSelectedRowChanged = (row: number) => {
    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)
    if (commit) {
      this.props.onCommitSelected(commit)
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
    if (!sha) {
      return -1
    }

    return this.props.commitSHAs.findIndex(s => s === sha)
  }

  public render() {
    if (this.props.commitSHAs.length === 0) {
      return (
        <div className="panel blankslate">{this.props.emptyListMessage}</div>
      )
    }

    return (
      <div id="commit-list">
        <List
          rowCount={this.props.commitSHAs.length}
          rowHeight={RowHeight}
          selectedRows={[this.rowForSHA(this.props.selectedSHA)]}
          rowRenderer={this.renderCommit}
          onSelectedRowChanged={this.onSelectedRowChanged}
          onScroll={this.onScroll}
          invalidationProps={{
            commits: this.props.commitSHAs,
            gitHubUsers: this.props.gitHubUsers,
          }}
        />
      </div>
    )
  }
}
