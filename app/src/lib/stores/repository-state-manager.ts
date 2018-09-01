import {
  IRepositoryState,
  RepositorySectionTab,
  ComparisonView,
  ICompareState,
  IChangesState,
  IBranchesState,
} from '../app-state'
import { Repository } from '../../models/repository'
import { merge } from '../merge'
import { IGitHubUser } from '../databases'
import { GitHubUserStore } from './github-user-store'
import {
  CommittedFileChange,
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { TipState } from '../../models/tip'
import { Branch } from '../../models/branch'
import { PullRequest } from '../../models/pull-request'
import { ComparisonCache } from '../comparison-cache'
import { Commit } from '../../models/commit'

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
      selectedFileIDs: [],
      diff: null,
      contextualCommitMessage: null,
      commitMessage: null,
      coAuthors: [],
      showCoAuthoredBy: false,
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
    },
    compareState: {
      formState: { kind: ComparisonView.None },
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

export class RepositoryStateManager {
  private repositoryState = new Map<string, IRepositoryState>()

  constructor(private gitHubUserStore: GitHubUserStore) {}

  /** Get the state for the repository. */
  public get(repository: Repository): IRepositoryState {
    let state = this.repositoryState.get(repository.hash)
    if (state) {
      const gitHubUsers =
        this.gitHubUserStore.getUsersForRepository(repository) ||
        new Map<string, IGitHubUser>()
      return merge(state, { gitHubUsers })
    }

    state = getInitialRepositoryState()
    this.repositoryState.set(repository.hash, state)
    return state
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
}
