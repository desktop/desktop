import { Branch } from '../../models/branch'
import { Commit } from '../../models/commit'
import { PullRequest } from '../../models/pull-request'
import { Repository } from '../../models/repository'
import {
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../models/status'
import { TipState } from '../../models/tip'
import {
  HistoryTabMode,
  IBranchesState,
  IChangesState,
  ICompareState,
  IRepositoryState,
  RepositorySectionTab,
  ICommitSelection,
  ChangesSelectionKind,
  IMultiCommitOperationUndoState,
  IMultiCommitOperationState,
  IPullRequestState,
} from '../app-state'
import { merge } from '../merge'
import { DefaultCommitMessage } from '../../models/commit-message'
import { sendNonFatalException } from '../helpers/non-fatal-exception'
import { StatsStore } from '../stats'
import { RepoRulesInfo } from '../../models/repo-rules'

export class RepositoryStateCache {
  private readonly repositoryState = new Map<string, IRepositoryState>()

  public constructor(private readonly statsStore: StatsStore) {}

  /** Get the state for the repository. */
  public get(repository: Repository): IRepositoryState {
    const existing = this.repositoryState.get(repository.hash)
    if (existing != null) {
      return existing
    }

    const newItem = getInitialRepositoryState()
    this.repositoryState.set(repository.hash, newItem)
    return newItem
  }

  public update<K extends keyof IRepositoryState>(
    repository: Repository,
    fn: (state: IRepositoryState) => Pick<IRepositoryState, K>
  ) {
    const currentState = this.get(repository)
    const newValues = fn(currentState)
    const newState = merge(currentState, newValues)

    const currentTip = currentState.branchesState.tip
    const newTip = newState.branchesState.tip

    // Only keep the "is amending" state if the head commit hasn't changed, it
    // matches the commit to amend, and there is no "fixing conflicts" state.
    const isAmending =
      newState.commitToAmend !== null &&
      newTip.kind === TipState.Valid &&
      currentTip.kind === TipState.Valid &&
      currentTip.branch.tip.sha === newTip.branch.tip.sha &&
      newTip.branch.tip.sha === newState.commitToAmend.sha &&
      newState.changesState.conflictState === null

    this.repositoryState.set(repository.hash, {
      ...newState,
      commitToAmend: isAmending ? newState.commitToAmend : null,
    })
  }

  public updateCompareState<K extends keyof ICompareState>(
    repository: Repository,
    fn: (state: ICompareState) => Pick<ICompareState, K>
  ) {
    this.update(repository, state => {
      const compareState = state.compareState
      const newValues = fn(compareState)

      return { compareState: merge(compareState, newValues) }
    })
  }

  public updateChangesState<K extends keyof IChangesState>(
    repository: Repository,
    fn: (changesState: IChangesState) => Pick<IChangesState, K>
  ) {
    this.update(repository, state => {
      const changesState = state.changesState
      const newState = merge(changesState, fn(changesState))
      this.recordSubmoduleDiffViewedFromChangesListIfNeeded(
        changesState,
        newState
      )
      return { changesState: newState }
    })
  }

  private recordSubmoduleDiffViewedFromChangesListIfNeeded(
    oldState: IChangesState,
    newState: IChangesState
  ) {
    // Make sure only one file is selected from the current commit
    if (
      newState.selection.kind !== ChangesSelectionKind.WorkingDirectory ||
      newState.selection.selectedFileIDs.length !== 1
    ) {
      return
    }

    const newFile = newState.workingDirectory.findFileWithID(
      newState.selection.selectedFileIDs[0]
    )

    // Make sure that file is a submodule
    if (newFile === null || newFile.status.submoduleStatus === undefined) {
      return
    }

    // If the old state was also a submodule, make sure it's a different one
    if (
      oldState.selection.kind === ChangesSelectionKind.WorkingDirectory &&
      oldState.selection.selectedFileIDs.length === 1 &&
      oldState.selection.selectedFileIDs[0] === newFile.id
    ) {
      return
    }

    this.statsStore.increment('submoduleDiffViewedFromChangesListCount')
  }

  public updateCommitSelection<K extends keyof ICommitSelection>(
    repository: Repository,
    fn: (state: ICommitSelection) => Pick<ICommitSelection, K>
  ) {
    this.update(repository, state => {
      const { commitSelection } = state
      const newState = merge(commitSelection, fn(commitSelection))
      this.recordSubmoduleDiffViewedFromHistoryIfNeeded(
        commitSelection,
        newState
      )
      return { commitSelection: newState }
    })
  }

  private recordSubmoduleDiffViewedFromHistoryIfNeeded(
    oldState: ICommitSelection,
    newState: ICommitSelection
  ) {
    // Just detect when the app is gonna show the diff of a different submodule
    // and record that in the stats.
    if (
      oldState.file?.id !== newState.file?.id &&
      newState.file?.status.submoduleStatus !== undefined
    ) {
      this.statsStore.increment('submoduleDiffViewedFromHistoryCount')
    }
  }

  public updateBranchesState<K extends keyof IBranchesState>(
    repository: Repository,
    fn: (branchesState: IBranchesState) => Pick<IBranchesState, K>
  ) {
    this.update(repository, state => {
      const changesState = state.branchesState
      const newState = merge(changesState, fn(changesState))
      return { branchesState: newState }
    })
  }

  public updateMultiCommitOperationUndoState<
    K extends keyof IMultiCommitOperationUndoState
  >(
    repository: Repository,
    fn: (
      state: IMultiCommitOperationUndoState | null
    ) => Pick<IMultiCommitOperationUndoState, K> | null
  ) {
    this.update(repository, state => {
      const { multiCommitOperationUndoState } = state
      const computedState = fn(multiCommitOperationUndoState)
      const newState =
        computedState === null
          ? null
          : merge(multiCommitOperationUndoState, computedState)
      return { multiCommitOperationUndoState: newState }
    })
  }

  public updateMultiCommitOperationState<
    K extends keyof IMultiCommitOperationState
  >(
    repository: Repository,
    fn: (
      state: IMultiCommitOperationState | null
    ) => Pick<IMultiCommitOperationState, K>
  ) {
    this.update(repository, state => {
      const { multiCommitOperationState } = state
      const toUpdate = fn(multiCommitOperationState)

      if (multiCommitOperationState === null) {
        // This is not expected, but we see instances in error reporting. Best
        // guess is that it would indicate that the user ended the state another
        // way such as via command line/on state load detection, in which we
        // would not want to crash the app.
        const msg = `Cannot update a null state, trying to update object with keys: ${Object.keys(
          toUpdate
        ).join(', ')}`
        sendNonFatalException('multiCommitOperation', new Error(msg))
        return { multiCommitOperationState: null }
      }

      const newState = merge(multiCommitOperationState, toUpdate)
      return { multiCommitOperationState: newState }
    })
  }

  public initializeMultiCommitOperationState(
    repository: Repository,
    multiCommitOperationState: IMultiCommitOperationState
  ) {
    this.update(repository, () => {
      return { multiCommitOperationState }
    })
  }

  public clearMultiCommitOperationState(repository: Repository) {
    this.update(repository, () => {
      return { multiCommitOperationState: null }
    })
  }

  public initializePullRequestState(
    repository: Repository,
    pullRequestState: IPullRequestState | null
  ) {
    this.update(repository, () => {
      return { pullRequestState }
    })
  }

  private sendPullRequestStateNotExistsException() {
    sendNonFatalException(
      'PullRequestState',
      new Error(`Cannot update a null pull request state`)
    )
  }

  public updatePullRequestState<K extends keyof IPullRequestState>(
    repository: Repository,
    fn: (pullRequestState: IPullRequestState) => Pick<IPullRequestState, K>
  ) {
    const { pullRequestState } = this.get(repository)
    if (pullRequestState === null) {
      this.sendPullRequestStateNotExistsException()
      return
    }

    this.update(repository, state => {
      const oldState = state.pullRequestState
      const pullRequestState =
        oldState === null ? null : merge(oldState, fn(oldState))
      return { pullRequestState }
    })
  }

  public updatePullRequestCommitSelection<K extends keyof ICommitSelection>(
    repository: Repository,
    fn: (prCommitSelection: ICommitSelection) => Pick<ICommitSelection, K>
  ) {
    const { pullRequestState } = this.get(repository)
    if (pullRequestState === null) {
      this.sendPullRequestStateNotExistsException()
      return
    }

    const oldState = pullRequestState.commitSelection
    const commitSelection =
      oldState === null ? null : merge(oldState, fn(oldState))
    this.updatePullRequestState(repository, () => ({
      commitSelection,
    }))
  }

  public clearPullRequestState(repository: Repository) {
    this.update(repository, () => {
      return { pullRequestState: null }
    })
  }
}

function getInitialRepositoryState(): IRepositoryState {
  return {
    commitSelection: {
      shas: [],
      shasInDiff: [],
      isContiguous: true,
      file: null,
      changesetData: { files: [], linesAdded: 0, linesDeleted: 0 },
      diff: null,
    },
    changesState: {
      workingDirectory: WorkingDirectoryStatus.fromFiles(
        new Array<WorkingDirectoryFileChange>()
      ),
      selection: {
        kind: ChangesSelectionKind.WorkingDirectory,
        selectedFileIDs: [],
        diff: null,
      },
      commitMessage: DefaultCommitMessage,
      coAuthors: [],
      showCoAuthoredBy: false,
      conflictState: null,
      stashEntry: null,
      currentBranchProtected: false,
      currentRepoRulesInfo: new RepoRulesInfo(),
    },
    selectedSection: RepositorySectionTab.Changes,
    branchesState: {
      tip: { kind: TipState.Unknown },
      defaultBranch: null,
      upstreamDefaultBranch: null,
      allBranches: new Array<Branch>(),
      recentBranches: new Array<Branch>(),
      openPullRequests: new Array<PullRequest>(),
      currentPullRequest: null,
      isLoadingPullRequests: false,
      forcePushBranches: new Map<string, string>(),
    },
    compareState: {
      formState: {
        kind: HistoryTabMode.History,
      },
      tip: null,
      mergeStatus: null,
      showBranchList: false,
      filterText: '',
      commitSHAs: [],
      shasToHighlight: [],
      branches: new Array<Branch>(),
      recentBranches: new Array<Branch>(),
      defaultBranch: null,
    },
    pullRequestState: null,
    commitAuthor: null,
    commitLookup: new Map<string, Commit>(),
    localCommitSHAs: [],
    localTags: null,
    tagsToPush: null,
    aheadBehind: null,
    remote: null,
    isPushPullFetchInProgress: false,
    isCommitting: false,
    commitToAmend: null,
    lastFetched: null,
    checkoutProgress: null,
    pushPullFetchProgress: null,
    revertProgress: null,
    multiCommitOperationUndoState: null,
    multiCommitOperationState: null,
  }
}
