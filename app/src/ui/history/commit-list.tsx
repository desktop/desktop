import * as React from 'react'
import memoize from 'memoize-one'
import { GitHubRepository } from '../../models/github-repository'
import { Commit, CommitOneLine } from '../../models/commit'
import { CommitListItem } from './commit-list-item'
import { KeyboardInsertionData, List } from '../lib/list'
import { arrayEquals } from '../../lib/equality'
import { DragData, DragType } from '../../models/drag-drop'
import classNames from 'classnames'
import memoizeOne from 'memoize-one'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import {
  enableCheckoutCommit,
  enableResetToCommit,
} from '../../lib/feature-flag'
import { getDotComAPIEndpoint } from '../../lib/api'
import { clipboard } from 'electron'
import { RowIndexPath } from '../lib/list/list-row-index-path'
import { assertNever } from '../../lib/fatal-error'
import { CommitDragElement } from '../drag-elements/commit-drag-element'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import { debounce } from 'lodash'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverScreenBorderPadding,
} from '../lib/popover'
import { KeyboardShortcut } from '../keyboard-shortcut/keyboard-shortcut'
import { Account } from '../../models/account'
import { Emoji } from '../../lib/emoji'

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

  /** Whether or not commits in this list can be undone. */
  readonly canUndoCommits?: boolean

  /** Whether or not commits in this list can be amended. */
  readonly canAmendCommits?: boolean

  /** Whether or the user can reset to commits in this list. */
  readonly canResetToCommits?: boolean

  /** The emoji lookup to render images inline */
  readonly emoji: Map<string, Emoji>

  /** The list of known local commits for the current branch */
  readonly localCommitSHAs: ReadonlyArray<string>

  /** The message to display inside the list when no results are displayed */
  readonly emptyListMessage?: JSX.Element | string

  /** Data to be reordered via keyboard */
  readonly keyboardReorderData?: KeyboardInsertionData

  /** Callback which fires when a commit has been selected in the list */
  readonly onCommitsSelected?: (
    commits: ReadonlyArray<Commit>,
    isContiguous: boolean
  ) => void

  /** Callback that fires when a scroll event has occurred */
  readonly onScroll?: (start: number, end: number) => void

  /** Callback to fire to undo a given commit in the current repository */
  readonly onUndoCommit?: (commit: Commit) => void

  /** Callback to fire to reset to a given commit in the current repository */
  readonly onResetToCommit?: (commit: Commit) => void

  /** Callback to fire to revert a given commit in the current repository */
  readonly onRevertCommit?: (commit: Commit) => void

  readonly onAmendCommit?: (commit: Commit, isLocalCommit: boolean) => void

  /** Callback to fire to open a given commit on GitHub */
  readonly onViewCommitOnGitHub?: (sha: string) => void

  /** Callback to fire to cancel a keyboard reordering operation */
  readonly onCancelKeyboardReorder?: () => void

  /**
   * Callback to fire to create a branch from a given commit in the current
   * repository
   */
  readonly onCreateBranch?: (commit: CommitOneLine) => void

  /**
   * Callback to fire to checkout the selected commit in the current
   * repository
   */
  readonly onCheckoutCommit?: (commit: CommitOneLine) => void

  /** Callback to fire to open the dialog to create a new tag on the given commit */
  readonly onCreateTag?: (targetCommitSha: string) => void

  /** Callback to fire to delete an unpushed tag */
  readonly onDeleteTag?: (tagName: string) => void

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
  readonly onCherryPick?: (commits: ReadonlyArray<CommitOneLine>) => void

  /** Callback to fire to start reordering commits with the keyboard */
  readonly onKeyboardReorder?: (toReorder: ReadonlyArray<Commit>) => void

  /** Callback to fire to squashing commits  */
  readonly onSquash?: (
    toSquash: ReadonlyArray<Commit>,
    squashOnto: Commit,
    lastRetainedCommitRef: string | null,
    isInvokedByContextMenu: boolean
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
  readonly tagsToPush?: ReadonlyArray<string>

  /** Whether or not commits in this list can be reordered. */
  readonly reorderingEnabled?: boolean

  /** Whether a multi commit operation is in progress (in particular the
   * conflicts resolution step allows interaction with history) */
  readonly isMultiCommitOperationInProgress?: boolean

  /** Callback to render commit drag element */
  readonly onRenderCommitDragElement?: (
    commit: Commit,
    selectedCommits: ReadonlyArray<Commit>
  ) => void

  /** Callback to remove commit drag element */
  readonly onRemoveCommitDragElement?: () => void

  /** Whether reordering should be enabled on the commit list */
  readonly disableReordering?: boolean

  /** Whether squashing should be enabled on the commit list */
  readonly disableSquashing?: boolean

  /** Shas that should be highlighted */
  readonly shasToHighlight?: ReadonlyArray<string>

  readonly accounts: ReadonlyArray<Account>
}

interface ICommitListState {
  /**
   * Aria live message used to guide users through the keyboard reordering
   * process.
   */
  readonly reorderingMessage: string
}

/** A component which displays the list of commits. */
export class CommitList extends React.Component<
  ICommitListProps,
  ICommitListState
> {
  private commitsHash = memoize(makeCommitsHash, arrayEquals)
  private commitIndexBySha = memoizeOne(
    (commitSHAs: ReadonlyArray<string>) =>
      new Map(commitSHAs.map((sha, index) => [sha, index]))
  )

  private containerRef = React.createRef<HTMLDivElement>()
  private listRef = React.createRef<List>()

  // This function is debounced to avoid updating the aria live region too
  // frequently on every key press.
  private updateKeyboardReorderingMessage = debounce(
    (insertionIndexPath: RowIndexPath | null) => {
      const { keyboardReorderData } = this.props

      if (keyboardReorderData === undefined) {
        this.setState({ reorderingMessage: '' })
        return
      }

      const plural = keyboardReorderData.commits.length === 1 ? '' : 's'

      if (insertionIndexPath !== null) {
        const { row } = insertionIndexPath

        const insertionPoint =
          row < this.props.commitSHAs.length
            ? `before commit ${row + 1}`
            : `after commit ${row}`

        this.setState({
          reorderingMessage: `Press Enter to insert the selected commit${plural} ${insertionPoint} or Escape to cancel.`,
        })
        return
      }

      this.setState({
        reorderingMessage: `Use the Up and Down arrow keys to choose a new location for the selected commit${plural}, then press Enter to confirm or Escape to cancel.`,
      })
    },
    500
  )

  public constructor(props: ICommitListProps) {
    super(props)

    this.state = { reorderingMessage: '' }
  }

  public componentDidUpdate(prevProps: ICommitListProps) {
    if (this.props.keyboardReorderData !== prevProps.keyboardReorderData) {
      this.updateKeyboardReorderingMessage(null)
    }
  }

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

  private isLocalCommit = (sha: string) =>
    this.props.localCommitSHAs.includes(sha)

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

    const isLocal = this.isLocalCommit(commit.sha)
    const unpushedTags = this.getUnpushedTags(commit)

    const showUnpushedIndicator =
      (isLocal || unpushedTags.length > 0) &&
      this.props.isLocalRepository === false

    return (
      <CommitListItem
        key={commit.sha}
        gitHubRepository={this.props.gitHubRepository}
        showUnpushedIndicator={showUnpushedIndicator}
        unpushedIndicatorTitle={this.getUnpushedIndicatorTitle(
          isLocal,
          unpushedTags.length
        )}
        commit={commit}
        emoji={this.props.emoji}
        isDraggable={
          this.props.isMultiCommitOperationInProgress === false &&
          !this.inKeyboardReorderMode
        }
        onSquash={this.onSquash}
        selectedCommits={this.selectedCommits}
        onRenderCommitDragElement={this.onRenderCommitDragElement}
        onRemoveDragElement={this.props.onRemoveCommitDragElement}
        disableSquashing={this.props.disableSquashing}
        accounts={this.props.accounts}
      />
    )
  }

  private get inKeyboardReorderMode() {
    return this.props.keyboardReorderData !== undefined
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

  private onSquash = (
    toSquash: ReadonlyArray<Commit>,
    squashOnto: Commit,
    isInvokedByContextMenu: boolean
  ) => {
    const indexes = [...toSquash, squashOnto].map(v =>
      this.props.commitSHAs.findIndex(sha => sha === v.sha)
    )
    this.props.onSquash?.(
      toSquash,
      squashOnto,
      this.getLastRetainedCommitRef(indexes),
      isInvokedByContextMenu
    )
  }

  private onRenderCommitDragElement = (commit: Commit) => {
    this.props.onRenderCommitDragElement?.(commit, this.selectedCommits)
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

  private get selectedCommits() {
    return this.lookupCommits(this.props.selectedSHAs)
  }

  private getUnpushedTags(commit: Commit) {
    const tagsToPushSet = new Set(this.props.tagsToPush ?? [])
    return commit.tags.filter(tagName => tagsToPushSet.has(tagName))
  }

  private onSelectionChanged = (rows: ReadonlyArray<number>) => {
    const selectedShas = rows.map(r => this.props.commitSHAs[r])
    const selectedCommits = this.lookupCommits(selectedShas)
    this.props.onCommitsSelected?.(selectedCommits, this.isContiguous(rows))
  }

  /**
   * Accepts a sorted array of numbers in descending order. If the numbers ar
   * contiguous order, 4, 3, 2 not 5, 3, 1, returns true.
   *
   * Defined an array of 0 and 1 are considered contiguous.
   */
  private isContiguous(indexes: ReadonlyArray<number>) {
    if (indexes.length <= 1) {
      return true
    }

    const sorted = [...indexes].sort((a, b) => b - a)

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i]
      if (i + 1 === sorted.length) {
        continue
      }

      if (current - 1 !== sorted[i + 1]) {
        return false
      }
    }

    return true
  }

  // This is required along with onSelectedRangeChanged in the case of a user
  // paging up/down or using arrow keys up/down.
  private onSelectedRowChanged = (row: number) => {
    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)
    if (commit) {
      this.props.onCommitsSelected?.([commit], true)
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
    this.props.onScroll?.(top, bottom)

    // Pass new scroll value so the scroll position will be remembered (if the callback has been supplied).
    this.props.onCompareListScrolled?.(scrollTop)
  }

  private rowForSHA(sha: string) {
    return this.commitIndexBySha(this.props.commitSHAs).get(sha) ?? -1
  }

  private getRowCustomClassMap = () => {
    const { commitSHAs, shasToHighlight } = this.props
    if (shasToHighlight === undefined || shasToHighlight.length === 0) {
      return undefined
    }

    const rowsForShasNotInDiff = commitSHAs
      .filter(sha => shasToHighlight.includes(sha))
      .map(sha => this.rowForSHA(sha))

    if (rowsForShasNotInDiff.length === 0) {
      return undefined
    }

    const rowClassMap = new Map<string, ReadonlyArray<number>>()
    rowClassMap.set('highlighted', rowsForShasNotInDiff)
    return rowClassMap
  }

  public focus() {
    this.listRef.current?.focus()
  }

  public render() {
    const {
      commitSHAs,
      selectedSHAs,
      shasToHighlight,
      emptyListMessage,
      reorderingEnabled,
      isMultiCommitOperationInProgress,
    } = this.props
    if (commitSHAs.length === 0) {
      return (
        <div className="panel blankslate">
          {emptyListMessage ?? 'No commits to list'}
        </div>
      )
    }

    const classes = classNames({
      'has-highlighted-commits':
        shasToHighlight !== undefined && shasToHighlight.length > 0,
    })

    const selectedRows = selectedSHAs
      .map(sha => this.rowForSHA(sha))
      .filter(r => r !== -1)

    return (
      <div id="commit-list" className={classes} ref={this.containerRef}>
        {this.renderReorderCommitsHint()}
        <List
          ref={this.listRef}
          rowCount={commitSHAs.length}
          rowHeight={RowHeight}
          selectedRows={selectedRows}
          rowRenderer={this.renderCommit}
          onDropDataInsertion={this.onDropDataInsertion}
          onSelectionChanged={this.onSelectionChanged}
          onSelectedRowChanged={this.onSelectedRowChanged}
          onKeyboardInsertionIndexPathChanged={
            this.onKeyboardInsertionIndexPathChanged
          }
          onCancelKeyboardInsertion={this.props.onCancelKeyboardReorder}
          onConfirmKeyboardInsertion={this.onConfirmKeyboardReorder}
          onRowContextMenu={this.onRowContextMenu}
          selectionMode="multi"
          onScroll={this.onScroll}
          keyboardInsertionData={this.props.keyboardReorderData}
          keyboardInsertionElementRenderer={this.renderKeyboardInsertionElement}
          insertionDragType={
            reorderingEnabled === true &&
            isMultiCommitOperationInProgress === false
              ? DragType.Commit
              : undefined
          }
          invalidationProps={{
            commits: this.props.commitSHAs,
            localCommitSHAs: this.props.localCommitSHAs,
            commitLookupHash: this.commitsHash(this.getVisibleCommits()),
            tagsToPush: this.props.tagsToPush,
            shasToHighlight: this.props.shasToHighlight,
          }}
          setScrollTop={this.props.compareListScrollTop}
          rowCustomClassNameMap={this.getRowCustomClassMap()}
        />
        <AriaLiveContainer message={this.state.reorderingMessage} />
      </div>
    )
  }

  private renderReorderCommitsHint = () => {
    if (!this.inKeyboardReorderMode) {
      return null
    }

    const containerWidth = this.containerRef.current?.clientWidth ?? 0
    const reorderCommitsHintTitle = __DARWIN__
      ? 'Reorder Commits'
      : 'Reorder commits'

    return (
      <Popover
        className="reorder-commits-hint-popover"
        anchor={this.containerRef.current}
        anchorOffset={PopoverScreenBorderPadding}
        anchorPosition={PopoverAnchorPosition.Top}
        isDialog={false}
        trapFocus={false}
        style={{
          width: `${containerWidth - 2 * PopoverScreenBorderPadding}px`,
        }}
      >
        <h4>{reorderCommitsHintTitle}</h4>
        <p>
          Use <KeyboardShortcut darwinKeys={['↑']} keys={['↑']} />
          <KeyboardShortcut darwinKeys={['↓']} keys={['↓']} /> to choose a new
          location.
        </p>
        <p>
          Press <KeyboardShortcut darwinKeys={['⏎']} keys={['⏎']} /> to confirm.
        </p>
      </Popover>
    )
  }

  private renderKeyboardInsertionElement = (
    data: KeyboardInsertionData
  ): JSX.Element | null => {
    const { emoji, gitHubRepository } = this.props
    const { commits } = data

    if (commits.length === 0) {
      return null
    }

    switch (data.type) {
      case DragType.Commit:
        return (
          <CommitDragElement
            gitHubRepository={gitHubRepository}
            commit={commits[0]}
            selectedCommits={commits}
            isKeyboardInsertion={true}
            emoji={emoji}
            accounts={this.props.accounts}
          />
        )
      default:
        return assertNever(data.type, `Unknown drag element type: ${data}`)
    }
  }

  private onRowContextMenu = (
    row: number,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    if (this.inKeyboardReorderMode) {
      return
    }

    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)
    if (commit === undefined) {
      if (__DEV__) {
        log.warn(
          `[CommitList]: the commit '${sha}' does not exist in the cache`
        )
      }
      return
    }

    let items: IMenuItem[] = []
    if (this.props.selectedSHAs.length > 1) {
      items = this.getContextMenuMultipleCommits(commit)
    } else {
      items = this.getContextMenuForSingleCommit(row, commit)
    }

    showContextualMenu(items)
  }

  private getContextMenuForSingleCommit(
    row: number,
    commit: Commit
  ): IMenuItem[] {
    const isLocal = this.isLocalCommit(commit.sha)

    const canBeUndone =
      this.props.canUndoCommits === true && isLocal && row === 0
    const canBeAmended = this.props.canAmendCommits === true && row === 0
    // The user can reset to any commit up to the first non-local one (included).
    // They cannot reset to the most recent commit... because they're already
    // in it.
    const isResettableCommit =
      row > 0 && row <= this.props.localCommitSHAs.length
    const canBeResetTo =
      this.props.canResetToCommits === true && isResettableCommit
    const canBeCheckedOut = row > 0 //Cannot checkout the current commit

    let viewOnGitHubLabel = 'View on GitHub'
    const gitHubRepository = this.props.gitHubRepository

    if (
      gitHubRepository &&
      gitHubRepository.endpoint !== getDotComAPIEndpoint()
    ) {
      viewOnGitHubLabel = 'View on GitHub Enterprise'
    }

    const items: IMenuItem[] = []

    if (canBeAmended) {
      items.push({
        label: __DARWIN__ ? 'Amend Commit…' : 'Amend commit…',
        action: () => this.props.onAmendCommit?.(commit, isLocal),
      })
    }

    if (canBeUndone) {
      items.push({
        label: __DARWIN__ ? 'Undo Commit…' : 'Undo commit…',
        action: () => {
          if (this.props.onUndoCommit) {
            this.props.onUndoCommit(commit)
          }
        },
        enabled: this.props.onUndoCommit !== undefined,
      })
    }

    if (enableResetToCommit()) {
      items.push({
        label: __DARWIN__ ? 'Reset to Commit…' : 'Reset to commit…',
        action: () => {
          if (this.props.onResetToCommit) {
            this.props.onResetToCommit(commit)
          }
        },
        enabled: canBeResetTo && this.props.onResetToCommit !== undefined,
      })
    }

    if (enableCheckoutCommit()) {
      items.push({
        label: __DARWIN__ ? 'Checkout Commit' : 'Checkout commit',
        action: () => {
          this.props.onCheckoutCommit?.(commit)
        },
        enabled: canBeCheckedOut && this.props.onCheckoutCommit !== undefined,
      })
    }

    items.push({
      label: __DARWIN__ ? 'Reorder Commit' : 'Reorder commit',
      action: () => {
        this.props.onKeyboardReorder?.([commit])
      },
      enabled: this.canReorder(),
    })

    items.push(
      {
        label: __DARWIN__
          ? 'Revert Changes in Commit'
          : 'Revert changes in commit',
        action: () => {
          if (this.props.onRevertCommit) {
            this.props.onRevertCommit(commit)
          }
        },
        enabled: this.props.onRevertCommit !== undefined,
      },
      { type: 'separator' },
      {
        label: __DARWIN__
          ? 'Create Branch from Commit'
          : 'Create branch from commit',
        action: () => {
          if (this.props.onCreateBranch) {
            this.props.onCreateBranch(commit)
          }
        },
      },
      {
        label: 'Create Tag…',
        action: () => this.props.onCreateTag?.(commit.sha),
        enabled: this.props.onCreateTag !== undefined,
      }
    )

    const deleteTagsMenuItem = this.getDeleteTagsMenuItem(commit)

    if (deleteTagsMenuItem !== null) {
      items.push(
        {
          type: 'separator',
        },
        deleteTagsMenuItem
      )
    }
    const darwinTagsLabel = commit.tags.length > 1 ? 'Copy Tags' : 'Copy Tag'
    const windowTagsLabel = commit.tags.length > 1 ? 'Copy tags' : 'Copy tag'
    items.push(
      {
        label: __DARWIN__ ? 'Cherry-pick Commit…' : 'Cherry-pick commit…',
        action: () => this.props.onCherryPick?.(this.selectedCommits),
        enabled: this.canCherryPick(),
      },
      { type: 'separator' },
      {
        label: 'Copy SHA',
        action: () => clipboard.writeText(commit.sha),
      },
      {
        label: __DARWIN__ ? darwinTagsLabel : windowTagsLabel,
        action: () => clipboard.writeText(commit.tags.join(' ')),
        enabled: commit.tags.length > 0,
      },
      {
        label: viewOnGitHubLabel,
        action: () => this.props.onViewCommitOnGitHub?.(commit.sha),
        enabled: !isLocal && !!gitHubRepository,
      }
    )

    return items
  }

  private canCherryPick(): boolean {
    const { onCherryPick, isMultiCommitOperationInProgress } = this.props
    return (
      onCherryPick !== undefined && isMultiCommitOperationInProgress === false
    )
  }

  private canReorder = () =>
    this.props.onKeyboardReorder !== undefined &&
    this.props.disableReordering === false &&
    this.props.isMultiCommitOperationInProgress === false

  private canSquash(): boolean {
    const { onSquash, disableSquashing, isMultiCommitOperationInProgress } =
      this.props
    return (
      onSquash !== undefined &&
      disableSquashing === false &&
      isMultiCommitOperationInProgress === false
    )
  }

  private getDeleteTagsMenuItem(commit: Commit): IMenuItem | null {
    const { onDeleteTag } = this.props
    const unpushedTags = this.getUnpushedTags(commit)

    if (
      onDeleteTag === undefined ||
      unpushedTags === undefined ||
      commit.tags.length === 0
    ) {
      return null
    }

    if (commit.tags.length === 1) {
      const tagName = commit.tags[0]

      return {
        label: `Delete tag ${tagName}`,
        action: () => onDeleteTag(tagName),
        enabled: unpushedTags.includes(tagName),
      }
    }

    // Convert tags to a Set to avoid O(n^2)
    const unpushedTagsSet = new Set(unpushedTags)

    return {
      label: 'Delete tag…',
      submenu: commit.tags.map(tagName => {
        return {
          label: tagName,
          action: () => onDeleteTag(tagName),
          enabled: unpushedTagsSet.has(tagName),
        }
      }),
    }
  }

  private getContextMenuMultipleCommits(commit: Commit): IMenuItem[] {
    const count = this.props.selectedSHAs.length

    return [
      {
        label: __DARWIN__
          ? `Cherry-pick ${count} Commits…`
          : `Cherry-pick ${count} commits…`,
        action: () => this.props.onCherryPick?.(this.selectedCommits),
        enabled: this.canCherryPick(),
      },
      {
        label: __DARWIN__
          ? `Squash ${count} Commits…`
          : `Squash ${count} commits…`,
        action: () => this.onSquash(this.selectedCommits, commit, true),
        enabled: this.canSquash(),
      },
      {
        label: __DARWIN__
          ? `Reorder ${count} Commits…`
          : `Reorder ${count} commits…`,
        action: () => this.props.onKeyboardReorder?.(this.selectedCommits),
        enabled: this.canReorder(),
      },
    ]
  }

  private onKeyboardInsertionIndexPathChanged = (indexPath: RowIndexPath) => {
    this.updateKeyboardReorderingMessage(indexPath)
  }

  private onConfirmKeyboardReorder = (
    indexPath: RowIndexPath,
    data: KeyboardInsertionData
  ) => {
    this.onDropDataInsertion(indexPath.row, data)
  }

  private onDropDataInsertion = (row: number, data: DragData) => {
    if (
      this.props.onDropCommitInsertion === undefined ||
      data.type !== DragType.Commit
    ) {
      return
    }

    // The base commit index will be in row - 1, because row is the position
    // where the new item should be inserted, and commits have a reverse order
    // (newer commits are in lower row values) in the list.
    const baseCommitIndex = row === 0 ? null : row - 1

    if (
      this.props.commitSHAs.length === 0 ||
      (baseCommitIndex !== null &&
        baseCommitIndex > this.props.commitSHAs.length)
    ) {
      return
    }

    const baseCommitSHA =
      baseCommitIndex === null ? null : this.props.commitSHAs[baseCommitIndex]
    const baseCommit =
      baseCommitSHA !== null ? this.props.commitLookup.get(baseCommitSHA) : null

    const commitIndexes = data.commits
      .filter((v): v is Commit => v !== null && v !== undefined)
      .map(v => this.props.commitSHAs.findIndex(sha => sha === v.sha))
      .sort() // Required to check if they're contiguous

    // Check if values in commit indexes are contiguous
    const commitsAreContiguous = commitIndexes.every((value, i, array) => {
      return i === array.length - 1 || value === array[i + 1] - 1
    })

    // If commits are contiguous and they are dropped in a position contained
    // among those indexes, ignore the drop.
    if (commitsAreContiguous) {
      const firstDroppedCommitIndex = commitIndexes[0]

      // Commits are dropped right above themselves if
      // 1. The base commit index is null (meaning, it was dropped at the top
      //    of the commit list) and the index of the first dropped commit is 0.
      // 2. The base commit index is the index right above the first dropped.
      const commitsDroppedRightAboveThemselves =
        (baseCommitIndex === null && firstDroppedCommitIndex === 0) ||
        baseCommitIndex === firstDroppedCommitIndex - 1

      // Commits are dropped within themselves if there is a base commit index
      // and it's in the list of commit indexes.
      const commitsDroppedWithinThemselves =
        baseCommitIndex !== null &&
        commitIndexes.indexOf(baseCommitIndex) !== -1

      if (
        commitsDroppedRightAboveThemselves ||
        commitsDroppedWithinThemselves
      ) {
        return
      }
    }

    const allIndexes = commitIndexes.concat(
      baseCommitIndex !== null ? [baseCommitIndex] : []
    )

    this.props.onDropCommitInsertion(
      baseCommit ?? null,
      data.commits,
      this.getLastRetainedCommitRef(allIndexes)
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
