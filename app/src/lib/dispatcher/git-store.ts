import * as Fs from 'fs'
import * as Path from 'path'
import { Emitter, Disposable } from 'event-kit'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { Tip, TipState } from '../../models/tip'
import { User } from '../../models/user'
import { Commit } from '../../models/commit'
import { IRemote } from '../../models/remote'

import {
  reset,
  GitResetMode,
  getDefaultRemote,
  fetch as fetchRepo,
  getRecentBranches,
  getBranches,
  getTip,
  deleteBranch,
  IAheadBehind,
  getBranchAheadBehind,
  getCommits,
  merge,
  setRemoteURL,
} from '../git'

/** The number of commits to load from history per batch. */
const CommitBatchSize = 100

const LoadingHistoryRequestKey = 'history'

/** The max number of recent branches to find. */
const RecentBranchesLimit = 5

/** A commit message summary and description. */
export interface ICommitMessage {
  readonly summary: string
  readonly description: string | null
}

/** The store for a repository's git data. */
export class GitStore {
  private readonly emitter = new Emitter()

  /** The commits keyed by their SHA. */
  public readonly commits = new Map<string, Commit>()

  private _history: ReadonlyArray<string> = new Array()

  private readonly requestsInFight = new Set<string>()

  private readonly repository: Repository

  private _tip: Tip = { kind: TipState.Unknown }

  private _defaultBranch: Branch | null = null

  private _allBranches: ReadonlyArray<Branch> = []

  private _recentBranches: ReadonlyArray<Branch> = []

  private _localCommitSHAs: ReadonlyArray<string> = []

  private _commitMessage: ICommitMessage | null
  private _contextualCommitMessage: ICommitMessage | null

  private _aheadBehind: IAheadBehind | null = null

  private _remote: IRemote | null = null

  private _lastFetched: Date | null = null

  public constructor(repository: Repository) {
    this.repository = repository
  }

  private emitUpdate() {
    this.emitter.emit('did-update', {})
  }

  private emitNewCommitsLoaded(commits: ReadonlyArray<Commit>) {
    this.emitter.emit('did-load-new-commits', commits)
  }

  private emitError(error: Error) {
    this.emitter.emit('did-error', error)
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /** Register a function to be called when the store loads new commits. */
  public onDidLoadNewCommits(fn: (commits: ReadonlyArray<Commit>) => void): Disposable {
    return this.emitter.on('did-load-new-commits', fn)
  }

  /** Register a function to be called when an error occurs. */
  public onDidError(fn: (error: Error) => void): Disposable {
    return this.emitter.on('did-error', fn)
  }

  /** Load history from HEAD. */
  public async loadHistory() {
    if (this.requestsInFight.has(LoadingHistoryRequestKey)) { return }

    this.requestsInFight.add(LoadingHistoryRequestKey)

    let commits = await this.performFailableOperation(() => getCommits(this.repository, 'HEAD', CommitBatchSize))
    if (!commits) { return }

    let existingHistory = this._history
    if (existingHistory.length > 0) {
      const mostRecent = existingHistory[0]
      const index = commits.findIndex(c => c.sha === mostRecent)
      // If we found the old HEAD, then we can just splice the new commits into
      // the history we already loaded.
      //
      // But if we didn't, it means the history we had and the history we just
      // loaded have diverged significantly or in some non-trivial way
      // (e.g., HEAD reset). So just throw it out and we'll start over fresh.
      if (index > -1) {
        commits = commits.slice(0, index)
      } else {
        existingHistory = []
      }
    }

    this._history = [ ...commits.map(c => c.sha), ...existingHistory ]
    this.storeCommits(commits)

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

    const commits = await this.performFailableOperation(() => getCommits(this.repository, `${lastSHA}^`, CommitBatchSize))
    if (!commits) { return }

    this._history = this._history.concat(commits.map(c => c.sha))
    this.storeCommits(commits)

    this.requestsInFight.delete(requestKey)

    this.emitNewCommitsLoaded(commits)
    this.emitUpdate()
  }

  /** The list of ordered SHAs. */
  public get history(): ReadonlyArray<string> { return this._history }

  /** Load the current and default branches. */
  public async loadCurrentAndDefaultBranch() {

    const currentTip = await this.performFailableOperation(() => getTip(this.repository))
    if (!currentTip) { return }

    this._tip = currentTip

    let defaultBranchName: string | null = 'master'
    const gitHubRepository = this.repository.gitHubRepository
    if (gitHubRepository && gitHubRepository.defaultBranch) {
      defaultBranchName = gitHubRepository.defaultBranch
    }

    if (this._tip.kind === TipState.Valid) {
      const currentBranch = this._tip.branch

      // If the current branch is the default branch, we can skip looking it up.
      if (currentBranch.name === defaultBranchName) {
        this._defaultBranch = currentBranch
      } else {
        this._defaultBranch = await this.loadBranch(defaultBranchName)
      }
    }
    this.emitUpdate()
  }

  /** Load all the branches. */
  public async loadBranches() {
    let localBranches = await this.performFailableOperation(() => getBranches(this.repository, 'refs/heads', BranchType.Local))
    if (!localBranches) {
      localBranches = []
    }

    let remoteBranches = await this.performFailableOperation(() => getBranches(this.repository, 'refs/remotes', BranchType.Remote))
    if (!remoteBranches) {
      remoteBranches = []
    }

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

    this.loadRecentBranches()

    const commits = allBranches.map(b => b.tip)

    for (const commit of commits) {
      this.commits.set(commit.sha, commit)
    }

    this.emitNewCommitsLoaded(commits)
    this.emitUpdate()
  }

  /**
   * Try to load a branch using its name. This will prefer local branches over
   * remote branches.
   */
  private async loadBranch(branchName: string): Promise<Branch | null> {
    const localBranches = await this.performFailableOperation(() => getBranches(this.repository, `refs/heads/${branchName}`, BranchType.Local))
    if (localBranches && localBranches.length) {
      return localBranches[0]
    }

    const remoteBranches = await this.performFailableOperation(() => getBranches(this.repository, `refs/remotes/${branchName}`, BranchType.Remote))
    if (remoteBranches && remoteBranches.length) {
      return remoteBranches[0]
    }

    return null
  }

  /** The current branch. */
  public get tip(): Tip { return this._tip }

  /** The default branch, or `master` if there is no default. */
  public get defaultBranch(): Branch | null { return this._defaultBranch }

  /** All branches, including the current branch and the default branch. */
  public get allBranches(): ReadonlyArray<Branch> { return this._allBranches }

  /** The most recently checked out branches. */
  public get recentBranches(): ReadonlyArray<Branch> { return this._recentBranches }

  /** Load the recent branches. */
  private async loadRecentBranches() {
    const recentBranches = await this.performFailableOperation(() => getRecentBranches(this.repository, this._allBranches, RecentBranchesLimit))
    if (recentBranches) {
      this._recentBranches = recentBranches
    } else {
      this._recentBranches = []
    }

    this.emitUpdate()
  }

  /** Load the local commits. */
  public async loadLocalCommits(branch: Branch): Promise<void> {
    let localCommits: ReadonlyArray<Commit> | undefined
    if (branch.upstream) {
      const revRange = `${branch.upstream}..${branch.name}`
      localCommits = await this.performFailableOperation(() => getCommits(this.repository, revRange, CommitBatchSize))
    } else {
      localCommits = await this.performFailableOperation(() => getCommits(this.repository, 'HEAD', CommitBatchSize, [ '--not', '--remotes' ]))
    }

    if (!localCommits) { return }

    this.storeCommits(localCommits)
    this._localCommitSHAs = localCommits.map(c => c.sha)
    this.emitUpdate()
  }

  /**
   * The ordered array of local commit SHAs. The commits themselves can be
   * looked up in `commits`.
   */
  public get localCommitSHAs(): ReadonlyArray<string> {
    return this._localCommitSHAs
  }

  /** Store the given commits. */
  private storeCommits(commits: ReadonlyArray<Commit>) {
    for (const commit of commits) {
      this.commits.set(commit.sha, commit)
    }
  }

  /**
   * Undo a specific commit for the current repository.
   *
   * @param commit - The commit to remove - should be the tip of the current branch.
   */
  public async undoCommit(commit: Commit): Promise<void> {
    // For an initial commit, just delete the reference but leave HEAD. This
    // will make the branch unborn again.
    let success: true | undefined = undefined
    if (!commit.parentSHAs.length) {

      if (this.tip.kind === TipState.Valid) {
        const branch = this.tip.branch
        success = await this.performFailableOperation(() => deleteBranch(this.repository, branch, null))
      } else {
        console.error(`Can't undo ${commit.sha} because it doesn't have any parents and there's no current branch. How on earth did we get here?!`)
        return Promise.resolve()
      }
    } else {
      success = await this.performFailableOperation(() => reset(this.repository, GitResetMode.Mixed, commit.parentSHAs[0]))
    }

    if (success) {
      this._contextualCommitMessage = {
        summary: commit.summary,
        description: commit.body,
      }
    }

    this.emitUpdate()
  }

  /**
   * Perform an operation that may fail by throwing an error. If an error is
   * thrown, catch it and emit it, and return `undefined`.
   */
  public async performFailableOperation<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await fn()
      return result
    } catch (e) {
      this.emitError(e)
      return undefined
    }
  }

  /** The commit message for a work-in-progress commit in the changes view. */
  public get commitMessage(): ICommitMessage | null {
    return this._commitMessage
  }

  /**
   * The commit message to use based on the contex of the repository, e.g., the
   * message from a recently undone commit.
   */
  public get contextualCommitMessage(): ICommitMessage | null {
    return this._contextualCommitMessage
  }

  /** Clear the contextual commit message. */
  public clearContextualCommitMessage(): Promise<void> {
    this._contextualCommitMessage = null
    this.emitUpdate()
    return Promise.resolve()
  }

  /**
   * Fetch, using the given user for authentication.
   *
   * @param user - The user to use for authentication if needed.
   */
  public async fetch(user: User | null): Promise<void> {
    const remote = this._remote
    if (!remote) { return }

    return fetchRepo(this.repository, user, remote.name)
  }

  /** Calculate the ahead/behind for the current branch. */
  public async calculateAheadBehindForCurrentBranch(): Promise<void> {

    if (this.tip.kind === TipState.Valid) {
      const branch = this.tip.branch
      this._aheadBehind = await getBranchAheadBehind(this.repository, branch)
    }

    this.emitUpdate()
  }

  /** Load the default remote. */
  public async loadDefaultRemote(): Promise<void> {
    this._remote = await getDefaultRemote(this.repository)

    this.emitUpdate()
  }

  /**
   * The number of commits the current branch is ahead and behind, relative to
   * its upstream.
   *
   * It will be `null` if ahead/behind hasn't been calculated yet, or if the
   * branch doesn't have an upstream.
   */
  public get aheadBehind(): IAheadBehind | null { return this._aheadBehind }

  /** Get the remote we're working with. */
  public get remote(): IRemote | null { return this._remote }

  public setCommitMessage(message: ICommitMessage | null): Promise<void> {
    this._commitMessage = message
    this.emitUpdate()
    return Promise.resolve()
  }

  /** The date the repository was last fetched. */
  public get lastFetched(): Date | null { return this._lastFetched }

  /** Update the last fetched date. */
  public updateLastFetched(): Promise<void> {
    const path = Path.join(this.repository.path, '.git', 'FETCH_HEAD')
    return new Promise<void>((resolve, reject) => {
      Fs.stat(path, (err, stats) => {
        if (err) {
          // An error most likely means the repository's never been published.
          this._lastFetched = null
        } else if (stats.size > 0) {
          // If the file's empty then it _probably_ means the fetch failed and we
          // shouldn't update the last fetched date.
          this._lastFetched = stats.mtime
        }

        resolve()

        this.emitUpdate()
      })
    })
  }

  /** Merge the named branch into the current branch. */
  public merge(branch: string): Promise<void> {
    return this.performFailableOperation(() => merge(this.repository, branch))
  }

  public async setRemoteURL(name: string, url: string): Promise<void> {
    await this.performFailableOperation(() => setRemoteURL(this.repository, name, url))
    await this.loadDefaultRemote()

    this.emitUpdate()
  }
}
