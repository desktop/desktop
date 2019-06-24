import { Branch } from '../../models/branch'
import { Commit } from '../../models/commit'
import { PullRequest } from '../../models/pull-request'
import { Repository } from '../../models/repository'
import {
  CommittedFileChange,
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
  IRebaseState,
  ChangesSelectionKind,
} from '../app-state'
import { ComparisonCache } from '../comparison-cache'
import { IGitHubUser } from '../databases'
import { merge } from '../merge'
import { DefaultCommitMessage } from '../../models/commit-message'

export class RepositoryStateCache {
  private readonly repositoryState = new Map<string, IRepositoryState>()

  public constructor(
    private readonly getUsersForRepository: (
      repository: Repository
    ) => Map<string, IGitHubUser>
  ) {}

  /** Get the state for the repository. */
  public get(repository: Repository): IRepositoryState {
    const existing = this.repositoryState.get(repository.hash)
    if (existing != null) {
      const gitHubUsers = this.getUsersForRepository(repository)
      return merge(existing, { gitHubUsers })
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
    this.repositoryState.set(repository.hash, merge(currentState, newValues))
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
      return { changesState: newState }
    })
  }

  public updateCommitSelection<K extends keyof ICommitSelection>(
    repository: Repository,
    fn: (state: ICommitSelection) => Pick<ICommitSelection, K>
  ) {
    this.update(repository, state => {
      const { commitSelection } = state
      const newState = merge(commitSelection, fn(commitSelection))
      return { commitSelection: newState }
    })
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

  public updateRebaseState<K extends keyof IRebaseState>(
    repository: Repository,
    fn: (branchesState: IRebaseState) => Pick<IRebaseState, K>
  ) {
    this.update(repository, state => {
      const { rebaseState } = state
      const newState = merge(rebaseState, fn(rebaseState))
      return { rebaseState: newState }
    })
  }
}

function getInitialRepositoryState(): IRepositoryState {
  return {
    commitSelection: {
      sha: null,
      file: null,
      changedFiles: new Array<CommittedFileChange>(),
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
    },
    selectedSection: RepositorySectionTab.Changes,
    branchesState: {
      tip: { kind: TipState.Unknown },
      defaultBranch: null,
      allBranches: new Array<Branch>(),
      recentBranches: new Array<Branch>(),
      openPullRequests: new Array<PullRequest>(),
      currentPullRequest: null,
      isLoadingPullRequests: false,
      rebasedBranches: new Map<string, string>(),
    },
    compareState: {
      isDivergingBranchBannerVisible: false,
      formState: {
        kind: HistoryTabMode.History,
      },
      tip: null,
      mergeStatus: null,
      showBranchList: false,
      filterText: '',
      commitSHAs: [],
      aheadBehindCache: new ComparisonCache(),
      allBranches: new Array<Branch>(),
      recentBranches: new Array<Branch>(),
      defaultBranch: null,
      inferredComparisonBranch: { branch: null, aheadBehind: null },
    },
    rebaseState: {
      step: null,
      progress: null,
      commits: null,
      userHasResolvedConflicts: false,
    },
    commitAuthor: null,
    gitHubUsers: new Map<string, IGitHubUser>(),
    commitLookup: new Map<string, Commit>(),
    localCommitSHAs: [],
    aheadBehind: null,
    remote: null,
    isPushPullFetchInProgress: false,
    isCommitting: false,
    lastFetched: null,
    checkoutProgress: null,
    pushPullFetchProgress: null,
    revertProgress: null,
  }
}
