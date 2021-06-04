import * as React from 'react'
import memoize from 'memoize-one'
import { GitHubRepository } from '../../models/github-repository'
import { Commit, CommitOneLine } from '../../models/commit'
import { CommitListItem } from './commit-list-item'
import { List } from '../lib/list'
import { arrayEquals } from '../../lib/equality'
import { Popover, PopoverCaretPosition } from '../lib/popover'
import { Button } from '../lib/button'
import { encodePathAsUrl } from '../../lib/path'
import { DragData, DragType } from '../../models/drag-drop'

const RowHeight = 50

interface ICommitListProps {
  /** The GitHub repository associated with this commit (if found) */
  readonly gitHubRepository: GitHubRepository | null

  /** The list of commits SHAs to display, in order. */
  readonly commitSHAs: ReadonlyArray<string>

  /** The commits loaded, keyed by their full SHA. */
  readonly commitLookup: Map<string, Commit>

  /** The SHAs of the selected commits */
  readonly selectedSHAs: ReadonlyArray<string>

  /** The emoji lookup to render images inline */
  readonly emoji: Map<string, string>

  /** The list of known local commits for the current branch */
  readonly localCommitSHAs: ReadonlyArray<string>

  /** The message to display inside the list when no results are displayed */
  readonly emptyListMessage: JSX.Element | string

  /** Callback which fires when a commit has been selected in the list */
  readonly onCommitsSelected: (commits: ReadonlyArray<Commit>) => void

  /** Callback that fires when a scroll event has occurred */
  readonly onScroll: (start: number, end: number) => void

  /** Callback to fire to revert a given commit in the current repository */
  readonly onRevertCommit: ((commit: Commit) => void) | undefined

  /** Callback to fire to open a given commit on GitHub */
  readonly onViewCommitOnGitHub: (sha: string) => void

  /**
   * Callback to fire to create a branch from a given commit in the current
   * repository
   */
  readonly onCreateBranch: (commit: CommitOneLine) => void

  /** Callback to fire to open the dialog to create a new tag on the given commit */
  readonly onCreateTag: (targetCommitSha: string) => void

  /** Callback to fire to delete an unpushed tag */
  readonly onDeleteTag: (tagName: string) => void

  /**
   * A handler called whenever the user drops commits on the list to be inserted.
   *
   * @param baseCommit - The commit before the selected commits will be inserted.
   *                     This will be null when commits must be inserted at the
   *                     end of the list.
   * @param commitsToInsert -  The commits dropped by the user.
   */
  readonly onDropCommitInsertion?: (
    baseCommit: Commit | null,
    commitsToInsert: ReadonlyArray<Commit>,
    lastRetainedCommitRef: string | null
  ) => void

  /** Callback to fire to cherry picking the commit  */
  readonly onCherryPick: (commits: ReadonlyArray<CommitOneLine>) => void

  /** Callback to fire to squashing commits  */
  readonly onSquash: (
    toSquash: ReadonlyArray<Commit>,
    squashOnto: Commit,
    lastRetainedCommitRef: string | null
  ) => void

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

  /** Whether or not commits in this list can be reordered. */
  readonly reorderingEnabled: boolean

  /* Whether or not the user has been introduced to cherry picking feature */
  readonly hasShownCherryPickIntro: boolean

  /** Callback to fire when cherry pick intro popover has been dismissed */
  readonly onDismissCherryPickIntro: () => void

  /** Whether a cherry pick is progress */
  readonly isCherryPickInProgress: boolean

  /** Callback to render commit drag element */
  readonly onRenderCommitDragElement: (
    commit: Commit,
    selectedCommits: ReadonlyArray<Commit>
  ) => void

  /** Callback to remove commit drag element */
  readonly onRemoveCommitDragElement: () => void

  /** Whether squashing should be enabled on the commit list */
  readonly disableSquashing?: boolean
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
        emoji={this.props.emoji}
        onCreateBranch={this.props.onCreateBranch}
        onCreateTag={this.props.onCreateTag}
        onDeleteTag={this.props.onDeleteTag}
        onCherryPick={this.props.onCherryPick}
        onSquash={this.onSquash}
        onRevertCommit={this.props.onRevertCommit}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        selectedCommits={this.lookupCommits(this.props.selectedSHAs)}
        isCherryPickInProgress={this.props.isCherryPickInProgress}
        onRenderCommitDragElement={this.onRenderCommitDragElement}
        onRemoveDragElement={this.props.onRemoveCommitDragElement}
        disableSquashing={this.props.disableSquashing}
      />
    )
  }

  private getLastRetainedCommitRef(indexes: ReadonlyArray<number>) {
    const maxIndex = Math.max(...indexes)
    const lastIndex = this.props.commitSHAs.length - 1
    /* If the commit is the first commit in the branch, you cannot reference it
    using the sha */
    const lastRetainedCommitRef =
      maxIndex !== lastIndex ? `${this.props.commitSHAs[maxIndex]}^` : null
    return lastRetainedCommitRef
  }

  private onSquash = (toSquash: ReadonlyArray<Commit>, squashOnto: Commit) => {
    const indexes = [...toSquash, squashOnto].map(v =>
      this.props.commitSHAs.findIndex(sha => sha === v.sha)
    )
    this.props.onSquash(
      toSquash,
      squashOnto,
      this.getLastRetainedCommitRef(indexes)
    )
  }

  private onRenderCommitDragElement = (commit: Commit) => {
    this.props.onRenderCommitDragElement(
      commit,
      this.lookupCommits(this.props.selectedSHAs)
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

  private onSelectionChanged = (rows: ReadonlyArray<number>) => {
    // Multi select can give something like 1, 5, 3 depending on order that user
    // selects. We want to ensure they are in chronological order for best
    // cherry-picking results. If user wants to use cherry-picking for
    // reordering, they will need to do multiple cherry-picks.
    // Goal: first commit in history -> first on array
    const sorted = [...rows].sort((a, b) => b - a)

    const selectedShas = sorted.map(r => this.props.commitSHAs[r])
    const selectedCommits = this.lookupCommits(selectedShas)
    this.props.onCommitsSelected(selectedCommits)
  }

  // This is required along with onSelectedRangeChanged in the case of a user
  // paging up/down or using arrow keys up/down.
  private onSelectedRowChanged = (row: number) => {
    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)
    if (commit) {
      this.props.onCommitsSelected([commit])
    }
  }

  private lookupCommits(
    commitSHAs: ReadonlyArray<string>
  ): ReadonlyArray<Commit> {
    const commits: Commit[] = []
    commitSHAs.forEach(sha => {
      const commit = this.props.commitLookup.get(sha)
      if (commit === undefined) {
        log.warn(
          '[Commit List] - Unable to lookup commit from sha - This should not happen.'
        )
        return
      }
      commits.push(commit)
    })
    return commits
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

  private renderCherryPickIntroPopover() {
    if (this.props.hasShownCherryPickIntro) {
      return null
    }

    const cherryPickIntro = encodePathAsUrl(
      __dirname,
      'static/cherry-pick-intro.png'
    )

    return (
      <Popover caretPosition={PopoverCaretPosition.LeftTop}>
        <img src={cherryPickIntro} className="cherry-pick-intro" />
        <h3>
          Drag and drop to cherry pick!
          <span className="call-to-action-bubble">New</span>
        </h3>
        <p>
          Copy commits to another branch by dragging and dropping them onto a
          branch in the branch menu, or by right clicking on a commit.
        </p>
        <div>
          <Button onClick={this.props.onDismissCherryPickIntro} type="submit">
            Got it
          </Button>
        </div>
      </Popover>
    )
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
          selectedRows={this.props.selectedSHAs.map(sha => this.rowForSHA(sha))}
          rowRenderer={this.renderCommit}
          onDropDataInsertion={this.onDropDataInsertion}
          onSelectionChanged={this.onSelectionChanged}
          onSelectedRowChanged={this.onSelectedRowChanged}
          selectionMode="multi"
          onScroll={this.onScroll}
          insertionDragType={
            this.props.reorderingEnabled ? DragType.Commit : undefined
          }
          invalidationProps={{
            commits: this.props.commitSHAs,
            localCommitSHAs: this.props.localCommitSHAs,
            commitLookupHash: this.commitsHash(this.getVisibleCommits()),
            tagsToPush: this.props.tagsToPush,
          }}
          setScrollTop={this.props.compareListScrollTop}
        />
        {this.renderCherryPickIntroPopover()}
      </div>
    )
  }

  private onDropDataInsertion = (row: number, data: DragData) => {
    if (
      this.props.onDropCommitInsertion === undefined ||
      data.type !== DragType.Commit
    ) {
      return
    }

    const baseCommitSHA =
      row < this.props.commitSHAs.length ? this.props.commitSHAs[row] : null
    const baseCommit =
      baseCommitSHA !== null ? this.props.commitLookup.get(baseCommitSHA) : null
    const indexes = [...data.commits, baseCommit]
      .filter((v): v is Commit => v !== null && v !== undefined)
      .map(v => this.props.commitSHAs.findIndex(sha => sha === v.sha))

    this.props.onDropCommitInsertion(
      baseCommit ?? null,
      data.commits,
      this.getLastRetainedCommitRef(indexes)
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
