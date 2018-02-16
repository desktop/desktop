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

  /** The list of commits to display, in order. */
  readonly commits: ReadonlyArray<string>
  /** The commits loaded, keyed by their full SHA. */
  readonly commitLookup: Map<string, Commit>
  readonly selectedSHA: string | null
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly localCommitSHAs: ReadonlyArray<string>
  /** Callback which fires when a commit has been selected in the list */
  readonly onCommitChanged: (commit: Commit) => void
  /** Callback that fires when a scroll event has occurred */
  readonly onScroll: (start: number, end: number) => void
  /** Callback to fire to revert a given commit in the current repository */
  readonly onRevertCommit: (commit: Commit) => void
  /** Callback to fire to open a given commit on GitHub */
  readonly onViewCommitOnGitHub: (sha: string) => void
}

/** A component which displays the list of commits. */
export class CommitList extends React.Component<ICommitListProps, {}> {
  private renderCommit = (row: number) => {
    const sha = this.props.commits[row]
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
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
      />
    )
  }

  private onRowChanged = (row: number) => {
    const sha = this.props.commits[row]
    const commit = this.props.commitLookup.get(sha)
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
    if (!sha) {
      return -1
    }

    return this.props.commits.findIndex(s => s === sha)
  }

  public render() {
    if (this.props.commits.length === 0) {
      return <div className="panel blankslate">No history</div>
    }

    return (
      <div id="commit-list">
        <List
          rowCount={this.props.commits.length}
          rowHeight={RowHeight}
          selectedRow={this.rowForSHA(this.props.selectedSHA)}
          rowRenderer={this.renderCommit}
          onSelectionChanged={this.onRowChanged}
          onScroll={this.onScroll}
          invalidationProps={{
            commits: this.props.commits,
            gitHubUsers: this.props.gitHubUsers,
          }}
        />
      </div>
    )
  }
}
