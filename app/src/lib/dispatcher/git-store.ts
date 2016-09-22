import { Emitter, Disposable } from 'event-kit'
import { Repository } from '../../models/repository'
import { LocalGitOperations, Commit, Branch, BranchType } from '../local-git-operations'

/** The number of commits to load from history per batch. */
const CommitBatchSize = 100

const LoadingHistoryRequestKey = 'history'

/** The max number of recent branches to find. */
const RecentBranchesLimit = 5

/** The store for a repository's git data. */
export default class GitStore {
  private readonly emitter = new Emitter()

  /** The commits keyed by their SHA. */
  public readonly commits = new Map<string, Commit>()

  private _history: ReadonlyArray<string> = new Array()

  private readonly requestsInFight = new Set<string>()

  private readonly repository: Repository

  private _currentBranch: Branch | null = null

  private _defaultBranch: Branch | null = null

  private _allBranches: ReadonlyArray<Branch> = []

  private _recentBranches: ReadonlyArray<Branch> = []

  public constructor(repository: Repository) {
    this.repository = repository
  }

  private emitUpdate() {
    this.emitter.emit('did-update', {})
  }

  private emitNewCommitsLoaded(commits: ReadonlyArray<Commit>) {
    this.emitter.emit('did-load-new-commits', commits)
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /** Register a function to be called when the store loads new commits. */
  public onDidLoadNewCommits(fn: (commits: ReadonlyArray<Commit>) => void): Disposable {
    return this.emitter.on('did-load-new-commits', fn)
  }

  /** Load history from HEAD. */
  public async loadHistory() {
    if (this.requestsInFight.has(LoadingHistoryRequestKey)) { return }

    this.requestsInFight.add(LoadingHistoryRequestKey)

    let commits = await LocalGitOperations.getHistory(this.repository, 'HEAD', CommitBatchSize)

    const existingHistory = this._history
    if (existingHistory.length > 0) {
      const mostRecent = existingHistory[0]
      const index = commits.findIndex(c => c.sha === mostRecent)
      if (index > -1) {
        commits = commits.slice(0, index)
      }
    }

    this._history = this._history.concat(commits.map(c => c.sha))
    for (const commit of commits) {
      this.commits.set(commit.sha, commit)
    }

    this.requestsInFight.delete(LoadingHistoryRequestKey)

    this.emitNewCommitsLoaded(commits)
    this.emitUpdate()
  }

  /** Load the next batch of history, starting from the last loaded commit. */
  public async loadNextHistoryBatch() {
    if (this.requestsInFight.has(LoadingHistoryRequestKey)) { return }

    if (!this.history.length) { return }

    const lastSHA = this.history[this.history.length - 1]
    const requestKey = `history/${lastSHA}`
    if (this.requestsInFight.has(requestKey)) { return }

    this.requestsInFight.add(requestKey)

    const commits = await LocalGitOperations.getHistory(this.repository, `${lastSHA}^`, CommitBatchSize)

    this._history = this._history.concat(commits.map(c => c.sha))
    for (const commit of commits) {
      this.commits.set(commit.sha, commit)
    }

    this.requestsInFight.delete(requestKey)

    this.emitNewCommitsLoaded(commits)
    this.emitUpdate()
  }

  /** Load the commit for the SHA. */
  public async loadCommit(sha: string) {
    const existingCommit = this.commits.get(sha)
    // We've already loaded this commit and commits are I M M U T A B L E
    if (existingCommit) { return }

    const requestKey = `commit/${sha}`
    // We're already loading this commit so chill.
    if (this.requestsInFight.has(requestKey)) { return }

    this.requestsInFight.add(requestKey)

    const commit = await LocalGitOperations.getCommit(this.repository, sha)
    if (!commit) { return }

    this.commits.set(commit.sha, commit)

    this.requestsInFight.delete(requestKey)

    this.emitNewCommitsLoaded([ commit ])
    this.emitUpdate()
  }

  /** The list of ordered SHAs. */
  public get history(): ReadonlyArray<string> { return this._history }

  /** Load the current and default branches. */
  public async loadCurrentAndDefaultBranch() {
    this._currentBranch = await LocalGitOperations.getCurrentBranch(this.repository)

    let defaultBranchName: string | null = 'master'
    const gitHubRepository = this.repository.gitHubRepository
    if (gitHubRepository && gitHubRepository.defaultBranch) {
      defaultBranchName = gitHubRepository.defaultBranch
    }

    // If the current branch is the default branch, we can skip looking it up.
    if (this._currentBranch && this._currentBranch.name === defaultBranchName) {
      this._defaultBranch = this._currentBranch
    } else {
      this._defaultBranch = await this.loadBranch(defaultBranchName)
    }

    this.emitUpdate()
  }

  /** Load all the branches. */
  public async loadBranches() {
    const localBranches = await LocalGitOperations.getBranches(this.repository, 'refs/heads', BranchType.Local)
    const remoteBranches = await LocalGitOperations.getBranches(this.repository, 'refs/remotes', BranchType.Remote)

    const upstreamBranchesAdded = new Set<string>()
    const allBranches = new Array<Branch>()
    localBranches.forEach(branch => {
      allBranches.push(branch)

      if (branch.upstream) {
        upstreamBranchesAdded.add(branch.upstream)
      }
    })

    remoteBranches.forEach(branch => {
      // This means we already added the local branch of this remote branch, so
      // we don't need to add it again.
      if (upstreamBranchesAdded.has(branch.name)) { return }

      allBranches.push(branch)
    })

    this._allBranches = allBranches

    this.emitUpdate()

    for (const branch of allBranches) {
      this.loadCommit(branch.sha)
    }
  }

  /**
   * Try to load a branch using its name. This will prefer local branches over
   * remote branches.
   */
  private async loadBranch(branchName: string): Promise<Branch | null> {
    const localBranches = await LocalGitOperations.getBranches(this.repository, `refs/heads/${branchName}`, BranchType.Local)
    if (localBranches.length) {
      return localBranches[0]
    }

    const remoteBranches = await LocalGitOperations.getBranches(this.repository, `refs/remotes/${branchName}`, BranchType.Remote)
    if (remoteBranches.length) {
      return remoteBranches[0]
    }

    return null
  }

  /** The current branch. */
  public get currentBranch(): Branch | null { return this._currentBranch }

  /** The default branch, or `master` if there is no default. */
  public get defaultBranch(): Branch | null { return this._defaultBranch }

  /** All branches, including the current branch and the default branch. */
  public get allBranches(): ReadonlyArray<Branch> { return this._allBranches }

  /** The most recently checked out branches. */
  public get recentBranches(): ReadonlyArray<Branch> { return this._recentBranches }

  /** Load the recent branches. */
  public async loadRecentBranches() {
    this._recentBranches = await LocalGitOperations.getRecentBranches(this.repository, this._allBranches, RecentBranchesLimit)
    this.emitUpdate()
  }
}
