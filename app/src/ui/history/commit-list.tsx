import * as React from 'react'
import memoize from 'memoize-one'
import { GitHubRepository } from '../../models/github-repository'
import { Commit } from '../../models/commit'
import { CommitListItem } from './commit-list-item'
import { List } from '../lib/list'
import { IGitHubUser } from '../../lib/databases'
import { arrayEquals } from '../../lib/equality'

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
  readonly onRevertCommit: ((commit: Commit) => void) | undefined

  /** Callback to fire to open a given commit on GitHub */
  readonly onViewCommitOnGitHub: (sha: string) => void

  /** Callback to fire to open the dialog to create a new tag on the given commit */
  readonly onCreateTag: (targetCommitSha: string) => void

  /** Callback to fire to delete an unpushed tag */
  readonly onDeleteTag: (tagName: string) => void

  /**
   * Optional callback that fires on page scroll in order to allow passing
   * a new scrollTop value up to the parent component for storing.
   */
  readonly onCompareListScrolled?: (scrollTop: number) => void

  /* The scrollTop of the compareList. It is stored to allow for scroll position persistence */
  readonly compareListScrollTop?: number

  /* Whether the repository is local (it has no remotes) */
  readonly isLocalRepository: boolean

  /* Tags that haven't been pushed yet. This is used to show the unpushed indicator */
  readonly tagsToPush: ReadonlyArray<string> | null
}

/** A component which displays the list of commits. */
export class CommitList extends React.Component<ICommitListProps, {}> {
  private commitsHash = memoize(makeCommitsHash, arrayEquals)

  private getVisibleCommits(): ReadonlyArray<Commit> {
    const commits = new Array<Commit>()
    for (const sha of this.props.commitSHAs) {
      const commitMaybe = this.props.commitLookup.get(sha)
      // this should never be undefined, but just in case
      if (commitMaybe !== undefined) {
        commits.push(commitMaybe)
      }
    }
    return commits
  }

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

    const tagsToPushSet = new Set(this.props.tagsToPush || [])

    const isLocal = this.props.localCommitSHAs.includes(commit.sha)
    const unpushedTags = commit.tags.filter(tagName =>
      tagsToPushSet.has(tagName)
    )

    const showUnpushedIndicator =
      (isLocal || unpushedTags.length > 0) &&
      this.props.isLocalRepository === false

    return (
      <CommitListItem
        key={commit.sha}
        gitHubRepository={this.props.gitHubRepository}
        isLocal={isLocal}
        showUnpushedIndicator={showUnpushedIndicator}
        unpushedIndicatorTitle={this.getUnpushedIndicatorTitle(
          isLocal,
          unpushedTags.length
        )}
        unpushedTags={unpushedTags}
        commit={commit}
        gitHubUsers={this.props.gitHubUsers}
        emoji={this.props.emoji}
        onCreateTag={this.props.onCreateTag}
        onDeleteTag={this.props.onDeleteTag}
        onRevertCommit={this.props.onRevertCommit}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
      />
    )
  }

  private getUnpushedIndicatorTitle(
    isLocalCommit: boolean,
    numUnpushedTags: number
  ) {
    if (isLocalCommit) {
      return 'This commit has not been pushed to the remote repository'
    }

    if (numUnpushedTags > 0) {
      return `This commit has ${numUnpushedTags} tag${
        numUnpushedTags > 1 ? 's' : ''
      } to push`
    }

    return undefined
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

    // Pass new scroll value so the scroll position will be remembered (if the callback has been supplied).
    if (this.props.onCompareListScrolled != null) {
      this.props.onCompareListScrolled(scrollTop)
    }
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
            localCommitSHAs: this.props.localCommitSHAs,
            commitLookupHash: this.commitsHash(this.getVisibleCommits()),
            tagsToPush: this.props.tagsToPush,
          }}
          setScrollTop={this.props.compareListScrollTop}
        />
      </div>
    )
  }
}

/**
 * Makes a hash of the commit's data that will be shown in a CommitListItem
 */
function commitListItemHash(commit: Commit): string {
  return `${commit.sha} ${commit.tags}`
}

function makeCommitsHash(commits: ReadonlyArray<Commit>): string {
  return commits.map(commitListItemHash).join(' ')
}
