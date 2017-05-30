import * as Fs from 'fs'
import * as Path from 'path'
import { Emitter, Disposable } from 'event-kit'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange, AppFileStatus } from '../../models/status'
import { Branch, BranchType } from '../../models/branch'
import { Tip, TipState } from '../../models/tip'
import { Account } from '../../models/account'
import { Commit } from '../../models/commit'
import { IRemote } from '../../models/remote'
import { IFetchProgress } from '../app-state'

import { IAppShell } from '../../lib/dispatcher/app-shell'
import { ErrorWithMetadata, IErrorMetadata } from '../error-with-metadata'
import { structuralEquals } from '../../lib/equality'
import { compare } from '../../lib/compare'

import {
  reset,
  GitResetMode,
  getDefaultRemote,
  getRemotes,
  fetch as fetchRepo,
  fetchRefspec,
  getRecentBranches,
  getBranches,
  deleteRef,
  IAheadBehind,
  getBranchAheadBehind,
  getCommits,
  merge,
  setRemoteURL,
  removeFromIndex,
  checkoutPaths,
  getStatus,
  IStatusResult,
  getCommit,
} from '../git'

/** The number of commits to load from history per batch. */
const CommitBatchSize = 100

const LoadingHistoryRequestKey = 'history'

/** The max number of recent branches to find. */
const RecentBranchesLimit = 5

/** File statuses which indicate the file exists on disk. */
const OnDiskStatuses = new Set([
  AppFileStatus.New,
  AppFileStatus.Modified,
  AppFileStatus.Renamed,
  AppFileStatus.Conflicted,
])

/**
 * File statuses which indicate the file has previously been committed to the
 * repository.
 */
const CommittedStatuses = new Set([
  AppFileStatus.Modified,
  AppFileStatus.Deleted,
  AppFileStatus.Renamed,
  AppFileStatus.Conflicted,
])


/** A commit message summary and description. */
export interface ICommitMessage {
  readonly summary: string
  readonly description: string | null
}

/** The store for a repository's git data. */
export class GitStore {
  private readonly emitter = new Emitter()

  private readonly shell: IAppShell

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

  public constructor(repository: Repository, shell: IAppShell) {
    this.repository = repository
    this.shell = shell
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

  /** Load all the branches. */
  public async loadBranches() {
    const [ localAndRemoteBranches, recentBranchNames ] = await Promise.all([
      this.performFailableOperation(() => getBranches(this.repository)) || [],
      this.performFailableOperation(() => getRecentBranches(this.repository, RecentBranchesLimit)),
    ])

    if (!localAndRemoteBranches) {
      return
    }

    this._allBranches = this.mergeRemoteAndLocalBranches(localAndRemoteBranches)

    this.refreshDefaultBranch()
    this.refreshRecentBranches(recentBranchNames)

    const commits = this._allBranches.map(b => b.tip)

    for (const commit of commits) {
      this.commits.set(commit.sha, commit)
    }

    this.emitNewCommitsLoaded(commits)
    this.emitUpdate()
  }

  /**
   * Takes a list of local and remote branches and filters out "duplicate"
   * remote branches, i.e. remote branches that we already have a local
   * branch tracking.
   */
  private mergeRemoteAndLocalBranches(branches: ReadonlyArray<Branch>): ReadonlyArray<Branch> {
    const localBranches = new Array<Branch>()
    const remoteBranches = new Array<Branch>()

    for (const branch of branches) {
      if (branch.type === BranchType.Local) {
        localBranches.push(branch)
      } else if (branch.type === BranchType.Remote) {
        remoteBranches.push(branch)
      }
    }

    const upstreamBranchesAdded = new Set<string>()
    const allBranchesWithUpstream = new Array<Branch>()

    for (const branch of localBranches) {
      allBranchesWithUpstream.push(branch)

      if (branch.upstream) {
        upstreamBranchesAdded.add(branch.upstream)
      }
    }

    for (const branch of remoteBranches) {
      // This means we already added the local branch of this remote branch, so
      // we don't need to add it again.
      if (upstreamBranchesAdded.has(branch.name)) {
        continue
      }

      allBranchesWithUpstream.push(branch)
    }

    return allBranchesWithUpstream
  }

  private refreshDefaultBranch() {
    let defaultBranchName: string | null = 'master'
    const gitHubRepository = this.repository.gitHubRepository
    if (gitHubRepository && gitHubRepository.defaultBranch) {
      defaultBranchName = gitHubRepository.defaultBranch
    }

    if (defaultBranchName) {
      // Find the default branch among all of our branches, giving
      // priority to local branches by sorting them before remotes
      this._defaultBranch = this._allBranches
        .filter(b => b.name === defaultBranchName)
        .sort((x, y) => compare(x.type, y.type))
        .shift() || null
    } else {
      this._defaultBranch = null
    }
  }

  private refreshRecentBranches(recentBranchNames: ReadonlyArray<string> | undefined) {
    if (!recentBranchNames || !recentBranchNames.length) {
      this._recentBranches = []
      return
    }

    const branchesByName = this._allBranches
      .reduce((map, branch) =>
        map.set(branch.name, branch), new Map<string, Branch>())

    const recentBranches = new Array<Branch>()
      for (const name of recentBranchNames) {
        const branch = branchesByName.get(name)
        if (!branch) {
          // This means the recent branch has been deleted. That's fine.
          continue
        }

        recentBranches.push(branch)
      }

    this._recentBranches = recentBranches
  }

  /** The current branch. */
  public get tip(): Tip { return this._tip }

  /** The default branch, or `master` if there is no default. */
  public get defaultBranch(): Branch | null { return this._defaultBranch }

  /** All branches, including the current branch and the default branch. */
  public get allBranches(): ReadonlyArray<Branch> { return this._allBranches }

  /** The most recently checked out branches. */
  public get recentBranches(): ReadonlyArray<Branch> { return this._recentBranches }

  /**
   * Load local commits into memory for the current repository.
   *
   * @param branch The branch to query for unpublished commits.
   *
   * If the tip of the repository does not have commits (i.e. is unborn), this
   * should be invoked with `null`, which clears any existing commits from the
   * store.
   */
  public async loadLocalCommits(branch: Branch | null): Promise<void> {

    if (branch === null) {
      this._localCommitSHAs = [ ]
      return
    }

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
    if (commit.parentSHAs.length === 0) {
      success = await this.performFailableOperation(() => deleteRef(this.repository, 'HEAD',
      'Reverting first commit'))
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
   *
   * @param errorMetadata - The metadata which should be attached to any errors
   *                        that are thrown.
   */
  public async performFailableOperation<T>(fn: () => Promise<T>, errorMetadata?: IErrorMetadata): Promise<T | undefined> {
    try {
      const result = await fn()
      return result
    } catch (e) {
      if (errorMetadata) {
        e = new ErrorWithMetadata(e, errorMetadata)
      }

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


  /**
   * Fetch the default remote, using the given account for authentication.
   *
   * @param account          - The account to use for authentication if needed.
   * @param backgroundTask   - Was the fetch done as part of a background task?
   * @param progressCallback - A function that's called with information about
   *                           the overall fetch progress.
   */
  public async fetch(account: Account | null, backgroundTask: boolean, progressCallback?: (fetchProgress: IFetchProgress) => void): Promise<void> {
    const remote = this.remote
    if (!remote) {
      return Promise.resolve()
    }

    return this.fetchRemotes(account, [ remote ], backgroundTask, progressCallback)
  }

  /**
   * Fetch the specified remotes, using the given account for authentication.
   *
   * @param account          - The account to use for authentication if needed.
   * @param remotes          - The remotes to fetch from.
   * @param backgroundTask   - Was the fetch done as part of a background task?
   * @param progressCallback - A function that's called with information about
   *                           the overall fetch progress.
   */
  public async fetchRemotes(account: Account | null, remotes: ReadonlyArray<IRemote>, backgroundTask: boolean, progressCallback?: (fetchProgress: IFetchProgress) => void): Promise<void> {

    if (!remotes.length) {
      return
    }

    const weight = 1 / remotes.length

    for (let i = 0; i < remotes.length; i++) {
      const remote = remotes[i]
      const startProgressValue = i * weight

      await this.fetchRemote(account, remote.name, backgroundTask, (progress) => {
        if (progress && progressCallback) {
          progressCallback({
            ...progress,
            value: startProgressValue + (progress.value * weight),
          })
        }
      })
    }
  }

  /**
   * Fetch a remote, using the given account for authentication.
   *
   * @param account          - The account to use for authentication if needed.
   * @param remote           - The name of the remote to fetch from.
   * @param backgroundTask   - Was the fetch done as part of a background task?
   * @param progressCallback - A function that's called with information about
   *                           the overall fetch progress.
   */
  public async fetchRemote(account: Account | null, remote: string, backgroundTask: boolean, progressCallback?: (fetchProgress: IFetchProgress) => void): Promise<void> {
    await this.performFailableOperation(() => {
      return fetchRepo(this.repository, account, remote, progressCallback)
    }, { backgroundTask })
  }

  /**
   * Fetch a given refspec, using the given account for authentication.
   *
   * @param user - The user to use for authentication if needed.
   * @param refspec - The association between a remote and local ref to use as
   *                  part of this action. Refer to git-scm for more
   *                  information on refspecs: https://www.git-scm.com/book/tr/v2/Git-Internals-The-Refspec
   *
   */
  public async fetchRefspec(account: Account | null, refspec: string): Promise<void> {

    // TODO: we should favour origin here
    const remotes = await getRemotes(this.repository)

    for (const remote of remotes) {
      await this.performFailableOperation(() => fetchRefspec(this.repository, account, remote.name, refspec))
    }
  }

  /** Calculate the ahead/behind for the current branch. */
  public async calculateAheadBehindForCurrentBranch(): Promise<void> {

    if (this.tip.kind === TipState.Valid) {
      const branch = this.tip.branch
      this._aheadBehind = await getBranchAheadBehind(this.repository, branch)
    }

    this.emitUpdate()
  }

  public async loadStatus(): Promise<IStatusResult | null> {
    const status = await this.performFailableOperation(() =>
      getStatus(this.repository))

    if (!status) {
      return null
    }

    this._aheadBehind = status.branchAheadBehind || null

    const { currentBranch, currentTip } = status

    if (currentBranch || currentTip) {

      if (currentTip && currentBranch) {
        const cachedCommit = this.commits.get(currentTip)
        const branchTipCommit = cachedCommit || await this.performFailableOperation(() =>
          getCommit(this.repository, currentTip))

        if (!branchTipCommit) {
          throw new Error(`Could not load commit ${currentTip}`)
        }

        const branch = new Branch(
          currentBranch,
          status.currentUpstreamBranch || null,
          branchTipCommit,
          BranchType.Local,
        )
        this._tip = { kind: TipState.Valid, branch }
      } else if (currentTip) {
        this._tip = { kind: TipState.Detached, currentSha: currentTip }
      } else if (currentBranch) {
        this._tip = { kind: TipState.Unborn, ref: currentBranch }
      }
    } else {
      this._tip = { kind: TipState.Unknown }
    }

    this.emitUpdate()

    return status
  }

  /**
   * Load the remote for the current branch, or the default remote if no
   * tracking information found.
   */
  public async loadCurrentRemote(): Promise<void> {
    const tip = this.tip
    if (tip.kind === TipState.Valid) {
      const branch = tip.branch
      if (branch.remote) {
        const allRemotes = await getRemotes(this.repository)
        const foundRemote = allRemotes.find(r => r.name === branch.remote)
        if (foundRemote) {
          this._remote = foundRemote
        }
      }
    }

    if (!this._remote) {
      this._remote = await getDefaultRemote(this.repository)
    }

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

  /** Changes the URL for the remote that matches the given name  */
  public async setRemoteURL(name: string, url: string): Promise<void> {
    await this.performFailableOperation(() => setRemoteURL(this.repository, name, url))
    await this.loadCurrentRemote()

    this.emitUpdate()
  }

  /**
   * Read the contents of the repository .gitignore.
   *
   * Returns a promise which will either be rejected or resolved
   * with the contents of the file. If there's no .gitignore file
   * in the repository root the promise will resolve with null.
   */
  public async readGitIgnore(): Promise<string | null> {
    const repository = this.repository
    const ignorePath = Path.join(repository.path, '.gitignore')

    return new Promise<string | null>((resolve, reject) => {
      Fs.readFile(ignorePath, 'utf8', (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') {
            resolve(null)
          } else {
            reject(err)
          }
        } else {
          resolve(data)
        }
      })
    })
  }

  /**
   * Persist the given content to the repository root .gitignore.
   *
   * If the repository root doesn't contain a .gitignore file one
   * will be created, otherwise the current file will be overwritten.
   */
  public async saveGitIgnore(text: string): Promise<void> {
    const repository = this.repository
    const ignorePath = Path.join(repository.path, '.gitignore')
    const fileContents = ensureTrailingNewline(text)

    return new Promise<void>((resolve, reject) => {
      Fs.writeFile(ignorePath, fileContents, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  /** Ignore the given path or pattern. */
  public async ignore(pattern: string): Promise<void> {
    const text = await this.readGitIgnore() || ''
    const currentContents = ensureTrailingNewline(text)
    const newText = ensureTrailingNewline(`${currentContents}${pattern}`)
    await this.saveGitIgnore(newText)

    await removeFromIndex(this.repository, pattern)
  }

  public async discardChanges(files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<void> {

    const onDiskFiles = files.filter(f => OnDiskStatuses.has(f.status))
    const absolutePaths = onDiskFiles.map(f => Path.join(this.repository.path, f.path))
    for (const path of absolutePaths) {
      this.shell.moveItemToTrash(path)
    }

    const touchesGitIgnore = files.some(f => Path.basename(f.path) === '.gitignore')
    if (touchesGitIgnore && this.tip.kind === TipState.Valid) {
      const ref = await this.tip.branch.name
      await this.performFailableOperation(() => reset(this.repository, GitResetMode.Mixed, ref))
    }

    const modifiedFiles = files.filter(f => CommittedStatuses.has(f.status))

    if (modifiedFiles.length) {
      // in case any files have been staged outside Desktop - renames and copies do this by default
      await this.performFailableOperation(() => reset(this.repository, GitResetMode.Mixed, 'HEAD'))

      const pathsToCheckout = modifiedFiles.map(f => {
        if (f.status === AppFileStatus.Copied || f.status === AppFileStatus.Renamed) {
          // because of the above reset, we now need to discard the old path for these
          return f.oldPath!
        } else {
          return f.path
        }
      })

      await this.performFailableOperation(() => checkoutPaths(this.repository, pathsToCheckout))
    }
  }

  /** Load the contextual commit message if there is one. */
  public async loadContextualCommitMessage(): Promise<void> {
    const message = await this.getMergeMessage()
    const existingMessage = this._contextualCommitMessage
    // In the case where we're in the middle of a merge, we're gonna keep
    // finding the same merge message over and over. We don't need to keep
    // telling the world.
    if (existingMessage && message && structuralEquals(existingMessage, message)) {
      return
    }

    this._contextualCommitMessage = message
    this.emitUpdate()
  }

  /**
   * Get the merge message in the repository. This will resolve to null if the
   * repository isn't in the middle of a merge.
   */
  private async getMergeMessage(): Promise<ICommitMessage | null> {
    const messagePath = Path.join(this.repository.path, '.git', 'MERGE_MSG')
    return new Promise<ICommitMessage | null>((resolve, reject) => {
      Fs.readFile(messagePath, 'utf8', (err, data) => {
        if (err || !data.length) {
          resolve(null)
        } else {
          const pieces = data.match(/(.*)\n\n([\S\s]*)/m)
          if (!pieces || pieces.length < 3) {
            resolve(null)
            return
          }

          // exclude any commented-out lines from the MERGE_MSG body
          let description: string | null = pieces[2].split('\n')
            .filter(line => line[0] !== '#')
            .join('\n')

          // join with no elements will return an empty string
          if (description.length === 0) {
            description = null
          }

          resolve({
            summary: pieces[1],
            description,
          })
        }
      })
    })
  }
}

function ensureTrailingNewline(text: string): string {
  // mixed line endings might be an issue here
  if (!text.endsWith('\n')) {
    const linesEndInCRLF = text.indexOf('\r\n')
    return linesEndInCRLF === -1
      ? `${text}\n`
      : `${text}\r\n`
  } else {
    return text
  }
}
