import * as React from 'react'

import { Commit, CommitOneLine, ICommitContext } from '../../models/commit'
import { ICompareState } from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { defaultErrorHandler, Dispatcher } from '../dispatcher'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { TextBox } from '../lib/text-box'
import { FancyTextBox } from '../lib/fancy-text-box'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { AheadBehindStore } from '../../lib/stores/ahead-behind-store'
import { DragType } from '../../models/drag-drop'
import { PopupType } from '../../models/popup'
import { getUniqueCoauthorsAsAuthors } from '../../lib/unique-coauthors-as-authors'
import { getSquashedCommitDescription } from '../../lib/squash/squashed-commit-description'
import { doMergeCommitsExistAfterCommit } from '../../lib/git'
import { enableCommitReordering } from '../../lib/feature-flag'
import { DragAndDropIntroType } from './drag-and-drop-intro'
interface ICompareSidebarProps {
  readonly repository: Repository
  readonly isLocalRepository: boolean
  readonly compareState: ICompareState
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch | null
  readonly selectedCommitShas: ReadonlyArray<string>
  readonly onRevertCommit: (commit: Commit) => void
  readonly onAmendCommit: () => void
  readonly onViewCommitOnGitHub: (sha: string) => void
  readonly onCompareListScrolled: (scrollTop: number) => void
  readonly onCherryPick: (
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ) => void
  readonly compareListScrollTop?: number
  readonly localTags: Map<string, string> | null
  readonly tagsToPush: ReadonlyArray<string> | null
  readonly aheadBehindStore: AheadBehindStore
  readonly dragAndDropIntroTypesShown: ReadonlySet<DragAndDropIntroType>
  readonly isCherryPickInProgress: boolean
}

interface ICompareSidebarState {
  readonly filterText: string | null
}

/** If we're within this many rows from the bottom, load the next history batch. */
const CloseToBottomThreshold = 10

export class CompareSidebar extends React.Component<
  ICompareSidebarProps,
  ICompareSidebarState
> {
  private textbox: TextBox | null = null
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)
  private loadingMoreCommitsPromise: Promise<void> | null = null

  public constructor(props: ICompareSidebarProps) {
    super(props)

    this.state = { filterText: null }
  }

  public componentWillMount() {
    this.props.dispatcher.initializeCompare(this.props.repository)
  }

  public componentWillUnmount() {
    this.textbox = null
  }

  public render() {
    const { branches } = this.props.compareState

    return (
      <div id="compare-view">
        <div className="compare-form">
          <FancyTextBox
            symbol={OcticonSymbol.search}
            type="search"
            placeholder={
              __DARWIN__ ? 'Search Commit Message…' : 'Search commit message…'
            }
            value={this.state.filterText ?? ''}
            disabled={!branches.some(b => !b.isDesktopForkRemoteBranch)}
            onRef={this.onTextBoxRef}
            onValueChanged={this.onMessageSearchTextChanged}
            onKeyDown={this.onBranchFilterKeyDown}
            onSearchCleared={this.handleEscape}
          />
        </div>

        {this.renderCommits()}
      </div>
    )
  }

  private renderCommits() {
    return <div className="compare-commit-list">{this.renderCommitList()}</div>
  }

  private viewHistoryForBranch = () => {
    this.props.dispatcher.executeCompare(this.props.repository)

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      // showBranchList: false,
    })
  }

  private renderCommitList() {
    const { commitSHAs } = this.props.compareState

    const emptyListMessage = 'No history'

    return (
      <CommitList
        gitHubRepository={this.props.repository.gitHubRepository}
        isLocalRepository={this.props.isLocalRepository}
        commitLookup={this.props.commitLookup}
        commitSHAs={commitSHAs}
        selectedSHAs={this.props.selectedCommitShas}
        localCommitSHAs={this.props.localCommitSHAs}
        canResetToCommits={true}
        canUndoCommits={true}
        canAmendCommits={true}
        emoji={this.props.emoji}
        reorderingEnabled={enableCommitReordering()}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        onUndoCommit={this.onUndoCommit}
        onResetToCommit={this.onResetToCommit}
        onRevertCommit={this.props.onRevertCommit}
        onAmendCommit={this.props.onAmendCommit}
        onCommitsSelected={this.onCommitsSelected}
        onScroll={this.onScroll}
        onCreateBranch={this.onCreateBranch}
        onCreateTag={this.onCreateTag}
        onDeleteTag={this.onDeleteTag}
        onCherryPick={this.onCherryPick}
        onDropCommitInsertion={this.onDropCommitInsertion}
        onSquash={this.onSquash}
        emptyListMessage={emptyListMessage}
        onCompareListScrolled={this.props.onCompareListScrolled}
        compareListScrollTop={this.props.compareListScrollTop}
        tagsToPush={this.props.tagsToPush}
        dragAndDropIntroTypesShown={this.props.dragAndDropIntroTypesShown}
        onDragAndDropIntroSeen={this.onDragAndDropIntroSeen}
        isCherryPickInProgress={this.props.isCherryPickInProgress}
        onRenderCommitDragElement={this.onRenderCommitDragElement}
        onRemoveCommitDragElement={this.onRemoveCommitDragElement}
        disableSquashing={false}
      />
    )
  }

  private onDropCommitInsertion = async (
    baseCommit: Commit | null,
    commitsToInsert: ReadonlyArray<Commit>,
    lastRetainedCommitRef: string | null
  ) => {
    if (
      await doMergeCommitsExistAfterCommit(
        this.props.repository,
        lastRetainedCommitRef
      )
    ) {
      defaultErrorHandler(
        new Error(
          `Unable to reorder. Reordering replays all commits up to the last one required for the reorder. A merge commit cannot exist among those commits.`
        ),
        this.props.dispatcher
      )
      return
    }

    return this.props.dispatcher.reorderCommits(
      this.props.repository,
      commitsToInsert,
      baseCommit,
      lastRetainedCommitRef
    )
  }

  private onRenderCommitDragElement = (
    commit: Commit,
    selectedCommits: ReadonlyArray<Commit>
  ) => {
    this.props.dispatcher.setDragElement({
      type: DragType.Commit,
      commit,
      selectedCommits,
      gitHubRepository: this.props.repository.gitHubRepository,
    })
  }

  private onRemoveCommitDragElement = () => {
    this.props.dispatcher.clearDragElement()
  }

  private onDragAndDropIntroSeen = (intro: DragAndDropIntroType) => {
    this.props.dispatcher.markDragAndDropIntroAsSeen(intro)
  }

  private onBranchFilterKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    const key = event.key

    if (key === 'Enter') {
      const filterText = this.state.filterText

      if (filterText === null) {
        this.viewHistoryForBranch()
      } else {
        this.props.dispatcher.executeCompare(this.props.repository, filterText)

        this.props.dispatcher.updateCompareForm(this.props.repository, {
          filterText,
        })
      }

      if (this.textbox) {
        this.textbox.blur()
      }
    } else if (key === 'Escape') {
      this.handleEscape()
    }
  }

  private handleEscape = () => {
    this.clearFilterState()
    if (this.textbox) {
      this.textbox.blur()
    }
  }

  private onCommitsSelected = (commits: ReadonlyArray<Commit>) => {
    this.props.dispatcher.changeCommitSelection(
      this.props.repository,
      commits.map(c => c.sha)
    )

    this.loadChangedFilesScheduler.queue(() => {
      this.props.dispatcher.loadChangedFilesForCurrentSelection(
        this.props.repository
      )
    })
  }

  private onScroll = (start: number, end: number) => {
    const compareState = this.props.compareState

    const commits = compareState.commitSHAs
    if (commits.length - end <= CloseToBottomThreshold) {
      if (this.loadingMoreCommitsPromise != null) {
        // as this callback fires for any scroll event we need to guard
        // against re-entrant calls to loadCommitBatch
        return
      }

      this.loadingMoreCommitsPromise = this.props.dispatcher
        .loadNextCommitBatch(this.props.repository)
        .then(() => {
          // deferring unsetting this flag to some time _after_ the commits
          // have been appended to prevent eagerly adding more commits due
          // to scroll events (which fire indiscriminately)
          window.setTimeout(() => {
            this.loadingMoreCommitsPromise = null
          }, 500)
        })
    }
  }

  private onMessageSearchTextChanged = (filterText: string) => {
    this.setState({ filterText: filterText.length === 0 ? null : filterText })

    // this.props.dispatcher.updateCompareForm(this.props.repository, {
    //   filterText,
    // })
  }

  private clearFilterState = () => {
    this.setState({
      filterText: null,
    })

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      filterText: '',
    })

    this.viewHistoryForBranch()
  }

  private onTextBoxRef = (textbox: TextBox) => {
    this.textbox = textbox
  }

  private onCreateTag = (targetCommitSha: string) => {
    this.props.dispatcher.showCreateTagDialog(
      this.props.repository,
      targetCommitSha,
      this.props.localTags
    )
  }

  private onUndoCommit = (commit: Commit) => {
    this.props.dispatcher.undoCommit(this.props.repository, commit)
  }

  private onResetToCommit = (commit: Commit) => {
    this.props.dispatcher.resetToCommit(this.props.repository, commit)
  }

  private onCreateBranch = (commit: CommitOneLine) => {
    const { repository, dispatcher } = this.props

    dispatcher.showPopup({
      type: PopupType.CreateBranch,
      repository,
      targetCommit: commit,
    })
  }

  private onDeleteTag = (tagName: string) => {
    this.props.dispatcher.showDeleteTagDialog(this.props.repository, tagName)
  }

  private onCherryPick = (commits: ReadonlyArray<CommitOneLine>) => {
    this.props.onCherryPick(this.props.repository, commits)
  }

  private onSquash = async (
    toSquash: ReadonlyArray<Commit>,
    squashOnto: Commit,
    lastRetainedCommitRef: string | null,
    isInvokedByContextMenu: boolean
  ) => {
    const toSquashSansSquashOnto = toSquash.filter(
      c => c.sha !== squashOnto.sha
    )

    const allCommitsInSquash = [...toSquashSansSquashOnto, squashOnto]
    const coAuthors = getUniqueCoauthorsAsAuthors(allCommitsInSquash)

    const squashedDescription = getSquashedCommitDescription(
      toSquashSansSquashOnto,
      squashOnto
    )

    if (
      await doMergeCommitsExistAfterCommit(
        this.props.repository,
        lastRetainedCommitRef
      )
    ) {
      defaultErrorHandler(
        new Error(
          `Unable to squash. Squashing replays all commits up to the last one required for the squash. A merge commit cannot exist among those commits.`
        ),
        this.props.dispatcher
      )
      return
    }

    this.props.dispatcher.recordSquashInvoked(isInvokedByContextMenu)

    this.props.dispatcher.showPopup({
      type: PopupType.CommitMessage,
      repository: this.props.repository,
      coAuthors,
      showCoAuthoredBy: coAuthors.length > 0,
      commitMessage: {
        summary: squashOnto.summary,
        description: squashedDescription,
      },
      dialogTitle: `Squash ${allCommitsInSquash.length} Commits`,
      dialogButtonText: `Squash ${allCommitsInSquash.length} Commits`,
      prepopulateCommitSummary: true,
      onSubmitCommitMessage: async (context: ICommitContext) => {
        this.props.dispatcher.squash(
          this.props.repository,
          toSquashSansSquashOnto,
          squashOnto,
          lastRetainedCommitRef,
          context
        )
        return true
      },
    })
  }
}
