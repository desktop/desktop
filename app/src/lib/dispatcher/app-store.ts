import { Emitter, Disposable } from 'event-kit'
import * as Path from 'path'
import {
  IRepositoryState,
  IHistoryState,
  IHistorySelection,
  IAppState,
  RepositorySection,
  IChangesState,
  Popup,
  IBranchesState,
  IAppError,
  PossibleSelections,
  PopupType,
  SelectionType,
} from '../app-state'
import User from '../../models/user'
import Repository from '../../models/repository'
import GitHubRepository from '../../models/github-repository'
import { FileChange, WorkingDirectoryStatus, WorkingDirectoryFileChange } from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { matchGitHubRepository } from '../../lib/repository-matching'
import API, { getUserForEndpoint, IAPIUser } from '../../lib/api'
import { LocalGitOperations, Commit, Branch, BranchType } from '../local-git-operations'
import { CloningRepository, CloningRepositoriesStore } from './cloning-repositories-store'

const LastSelectedRepositoryIDKey = 'last-selected-repository-id'

/** The number of commits to load from history per batch. */
const CommitBatchSize = 100

/** The max number of recent branches to find. */
const RecentBranchesLimit = 5

export default class AppStore {
  private emitter = new Emitter()

  private users: ReadonlyArray<User> = new Array<User>()
  private repositories: ReadonlyArray<Repository> = new Array<Repository>()

  private selectedRepository: Repository | CloningRepository | null = null
  private repositoryState = new Map<number, IRepositoryState>()
  private loading = false

  private currentPopup: Popup | null = null

  private errors: ReadonlyArray<IAppError> = new Array<IAppError>()

  private emitQueued = false

  private readonly cloningRepositoriesStore = new CloningRepositoriesStore()

  public constructor() {
    this.cloningRepositoriesStore.onDidUpdate(() => {
      this.emitUpdate()
    })
  }

  private emitUpdate() {
    if (this.emitQueued) { return }

    this.emitQueued = true

    window.requestAnimationFrame(() => {
      this.emitter.emit('did-update', this.getState())
      this.emitQueued = false
    })
  }

  public onDidUpdate(fn: (state: IAppState) => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  private getInitialRepositoryState(): IRepositoryState {
    return {
      historyState: {
        selection: {
          commit: null,
          file: null,
        },
        commits: new Array<Commit>(),
        commitCount: 0,
        changedFiles: new Array<FileChange>(),
        loading: true,
      },
      changesState: {
        workingDirectory: new WorkingDirectoryStatus(new Array<WorkingDirectoryFileChange>(), true),
        selectedFile: null,
      },
      selectedSection: RepositorySection.History,
      branchesState: {
        currentBranch: null,
        defaultBranch: null,
        allBranches: new Array<Branch>(),
        recentBranches: new Array<Branch>(),
        commits: new Map<string, Commit>(),
      },
      committerEmail: null,
    }
  }

  private getRepositoryState(repository: Repository): IRepositoryState {
    let state = this.repositoryState.get(repository.id)
    if (state) { return state }

    state = this.getInitialRepositoryState()
    this.repositoryState.set(repository.id, state)
    return state
  }

  private updateRepositoryState(repository: Repository, fn: (state: IRepositoryState) => IRepositoryState) {
    const currentState = this.getRepositoryState(repository)
    this.repositoryState.set(repository.id, fn(currentState))
  }

  private updateHistoryState(repository: Repository, fn: (historyState: IHistoryState) => IHistoryState) {
    this.updateRepositoryState(repository, state => {
      const historyState = fn(state.historyState)
      return {
        historyState,
        changesState: state.changesState,
        selectedSection: state.selectedSection,
        committerEmail: state.committerEmail,
        branchesState: state.branchesState,
      }
    })
  }

  private updateChangesState(repository: Repository, fn: (changesState: IChangesState) => IChangesState) {
    this.updateRepositoryState(repository, state => {
      const changesState = fn(state.changesState)
      return {
        historyState: state.historyState,
        changesState,
        selectedSection: state.selectedSection,
        committerEmail: state.committerEmail,
        branchesState: state.branchesState,
      }
    })
  }

  private updateBranchesState(repository: Repository, fn: (branchesState: IBranchesState) => IBranchesState) {
    this.updateRepositoryState(repository, state => {
      const branchesState = fn(state.branchesState)
      return {
        historyState: state.historyState,
        changesState: state.changesState,
        selectedSection: state.selectedSection,
        committerEmail: state.committerEmail,
        branchesState,
      }
    })
  }

  private getSelectedState(): PossibleSelections | null {
    const repository = this.selectedRepository
    if (!repository) { return null }

    if (repository instanceof Repository) {
      return {
        type: SelectionType.Repository,
        repository,
        state: this.getRepositoryState(repository),
      }
    } else {
      const cloningState = this.cloningRepositoriesStore.getRepositoryState(repository)
      if (!cloningState) { return null }

      return {
        type: SelectionType.CloningRepository,
        repository,
        state: cloningState,
      }
    }
  }

  public getState(): IAppState {
    return {
      users: this.users,
      repositories: [
        ...this.repositories,
        ...this.cloningRepositoriesStore.repositories,
      ],
      selectedState: this.getSelectedState(),
      currentPopup: this.currentPopup,
      errors: this.errors,
      loading: this.loading,
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadHistory(repository: Repository): Promise<void> {
    this.updateHistoryState(repository, state => {
      return {
        commits: state.commits,
        selection: state.selection,
        changedFiles: state.changedFiles,
        commitCount: state.commitCount,
        loading: true
      }
    })
    this.emitUpdate()

    const headCommits = await LocalGitOperations.getHistory(repository, 'HEAD', CommitBatchSize)
    const commitCount = await LocalGitOperations.getCommitCount(repository)

    this.updateHistoryState(repository, state => {
      const existingCommits = state.commits
      let commits = new Array<Commit>()
      if (existingCommits.length > 0) {
        const mostRecent = existingCommits[0]
        const index = headCommits.findIndex(c => c.sha === mostRecent.sha)
        if (index > -1) {
          const newCommits = headCommits.slice(0, index)
          commits = commits.concat(newCommits)
          // TODO: This is gross and deserves a TS bug report.
          commits = commits.concat(Array.from(existingCommits))
        } else {
          commits = Array.from(headCommits)
          // The commits we already had are outside the first batch, so who
          // knows how far they are from HEAD now. Start over fresh.
        }
      } else {
        commits = Array.from(headCommits)
      }

      return {
        commits,
        selection: state.selection,
        changedFiles: state.changedFiles,
        commitCount,
        loading: false,
      }
    })

    const state = this.getRepositoryState(repository).historyState
    let newSelection = state.selection
    const commits = state.commits
    const selectedCommit = state.selection.commit
    if (selectedCommit) {
      const index = commits.findIndex(c => c.sha === selectedCommit.sha)
      // Our selected SHA disappeared, so clear the selection.
      if (index < 0) {
        newSelection = {
          commit: null,
          file: null,
        }
      }
    }

    if (!newSelection.commit && commits.length > 0) {
      newSelection = {
        commit: commits[0],
        file: null,
      }
      this._changeHistorySelection(repository, newSelection)
      this._loadChangedFilesForCurrentSelection(repository)
    }

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadNextHistoryBatch(repository: Repository): Promise<void> {
    const state = this.getRepositoryState(repository)
    if (state.historyState.loading) {
      return
    }

    this.updateHistoryState(repository, state => {
      return {
        commits: state.commits,
        selection: state.selection,
        changedFiles: state.changedFiles,
        commitCount: state.commitCount,
        loading: true
      }
    })
    this.emitUpdate()

    const lastCommit = state.historyState.commits[state.historyState.commits.length - 1]
    const commits = await LocalGitOperations.getHistory(repository, `${lastCommit.sha}^`, CommitBatchSize)

    this.updateHistoryState(repository, state => {
      return {
        commits: state.commits.concat(commits),
        selection: state.selection,
        changedFiles: state.changedFiles,
        commitCount: state.commitCount,
        loading: false,
      }
    })
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadChangedFilesForCurrentSelection(repository: Repository): Promise<void> {
    const state = this.getRepositoryState(repository)
    const selection = state.historyState.selection
    const currentCommit = selection.commit
    if (!currentCommit) { return }

    const changedFiles = await LocalGitOperations.getChangedFiles(repository, currentCommit.sha)

    // The selection could have changed between when we started loading the
    // changed files and we finished. We might wanna store the changed files per
    // SHA/path.
    if (currentCommit !== state.historyState.selection.commit) {
      return
    }

    this.updateHistoryState(repository, state => {
      return {
        commits: state.commits,
        selection,
        changedFiles,
        commitCount: state.commitCount,
        loading: state.loading,
      }
    })
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeHistorySelection(repository: Repository, selection: IHistorySelection): Promise<void> {
    this.updateHistoryState(repository, state => {
      const commitChanged = state.selection.commit !== selection.commit
      const changedFiles = commitChanged ? new Array<FileChange>() : state.changedFiles

      return {
        commits: state.commits,
        selection,
        changedFiles,
        commitCount: state.commitCount,
        loading: state.loading,
      }
    })
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _selectRepository(repository: Repository | CloningRepository | null): Promise<void> {
    this.selectedRepository = repository
    this.emitUpdate()

    if (!repository) { return Promise.resolve() }

    if (repository instanceof Repository) {
      localStorage.setItem(LastSelectedRepositoryIDKey, repository.id.toString())
      return this._refreshRepository(repository)
    } else {
      return Promise.resolve()
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _loadFromSharedProcess(users: ReadonlyArray<User>, repositories: ReadonlyArray<Repository>) {
    this.users = users
    this.repositories = repositories
    this.loading = this.repositories.length === 0 && this.users.length === 0

    const selectedRepository = this.selectedRepository
    let newSelectedRepository: Repository | CloningRepository | null = this.selectedRepository
    if (selectedRepository) {
      const i = this.repositories.findIndex(r => {
        return selectedRepository.constructor === r.constructor && r.id === selectedRepository.id
      })
      if (i === -1) {
        newSelectedRepository = null
      }
    }

    if (!this.selectedRepository && this.repositories.length > 0) {
      const lastSelectedID = parseInt(localStorage.getItem(LastSelectedRepositoryIDKey) || '', 10)
      if (lastSelectedID && !isNaN(lastSelectedID)) {
        newSelectedRepository = this.repositories.find(r => r.id === lastSelectedID) || null
      }

      if (!newSelectedRepository) {
        newSelectedRepository = this.repositories[0]
      }
    }

    if (newSelectedRepository !== selectedRepository) {
      this._selectRepository(newSelectedRepository)
    }

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadStatus(repository: Repository, clearPartialState: boolean = false): Promise<void> {
    let workingDirectory = new WorkingDirectoryStatus(new Array<WorkingDirectoryFileChange>(), true)
    try {
      const status = await LocalGitOperations.getStatus(repository)
      workingDirectory = status.workingDirectory
    } catch (e) {
      console.error(e)
    }

    this.updateChangesState(repository, state => {
      const filesByID = new Map<string, WorkingDirectoryFileChange>()
      state.workingDirectory.files.forEach(file => {
        filesByID.set(file.id, file)
      })

      const mergedFiles = workingDirectory.files.map(file => {
        const existingFile = filesByID.get(file.id)
        if (existingFile) {

          if (clearPartialState) {
            if (existingFile.selection.getSelectionType() === DiffSelectionType.Partial) {
              return file.withIncludeAll(false)
            }
          }

          return file.withSelection(existingFile.selection)
        } else {
          return file
        }
      })

      const includeAll = this.getIncludeAllState(mergedFiles)

      let selectedFile: WorkingDirectoryFileChange | undefined

      if (state.selectedFile) {
        selectedFile = mergedFiles.find(function(file) {
          return file.id === state.selectedFile!.id
        })
      }

      return {
        workingDirectory: new WorkingDirectoryStatus(mergedFiles, includeAll),
        selectedFile: selectedFile || null,
      }
    })
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeRepositorySection(repository: Repository, section: RepositorySection): Promise<void> {
    this.updateRepositoryState(repository, state => {
      return {
        historyState: state.historyState,
        changesState: state.changesState,
        selectedSection: section,
        committerEmail: state.committerEmail,
        branchesState: state.branchesState,
      }
    })
    this.emitUpdate()

    if (section === RepositorySection.History) {
      return this._loadHistory(repository)
    } else if (section === RepositorySection.Changes) {
      return this._loadStatus(repository)
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeChangesSelection(repository: Repository, selectedFile: WorkingDirectoryFileChange | null): Promise<void> {
    this.updateChangesState(repository, state => {
      return {
        workingDirectory: state.workingDirectory,
        selectedFile,
      }
    })
    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _commitIncludedChanges(repository: Repository, summary: string, description: string): Promise<void> {
    const state = this.getRepositoryState(repository)
    const files = state.changesState.workingDirectory.files.filter(function(file, index, array) {
      return file.selection.getSelectionType() !== DiffSelectionType.None
    })

    await LocalGitOperations.createCommit(repository, summary, description, files)

    return this._loadStatus(repository, true)
  }

  private getIncludeAllState(files: ReadonlyArray<WorkingDirectoryFileChange>): boolean | null {
    const allSelected = files.every(f => f.selection.getSelectionType() === DiffSelectionType.All)
    const noneSelected = files.every(f => f.selection.getSelectionType() === DiffSelectionType.None)

    let includeAll: boolean | null = null
    if (allSelected) {
      includeAll = true
    } else if (noneSelected) {
      includeAll = false
    }

    return includeAll
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeFileIncluded(repository: Repository, file: WorkingDirectoryFileChange, include: boolean): Promise<void> {
    this.updateRepositoryState(repository, state => {
      const newFiles = state.changesState.workingDirectory.files.map(f => {
        if (f.id === file.id) {
          return f.withIncludeAll(include)
        } else {
          return f
        }
      })

      const includeAll = this.getIncludeAllState(newFiles)

      let selectedFile: WorkingDirectoryFileChange | undefined
      if (state.changesState.selectedFile) {
          const f = state.changesState.selectedFile
          selectedFile = newFiles.find(file => file.id === f.id)
      }

      const workingDirectory = new WorkingDirectoryStatus(newFiles, includeAll)
      return {
        selectedSection: state.selectedSection,
        changesState: {
          workingDirectory,
          selectedFile: selectedFile || null,
        },
        historyState: state.historyState,
        committerEmail: state.committerEmail,
        branchesState: state.branchesState,
      }
    })
    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeFileLineSelection(repository: Repository, file: WorkingDirectoryFileChange, diffSelection: Map<number, boolean>): Promise<void> {
    this.updateRepositoryState(repository, state => {

      const newFiles = state.changesState.workingDirectory.files.map(f => {
        if (f.id === file.id) {
          return f.withDiffLinesSelection(diffSelection)
        } else {
          return f
        }
      })

      const includeAll = this.getIncludeAllState(newFiles)

      let selectedFile: WorkingDirectoryFileChange | undefined
      if (state.changesState.selectedFile) {
          const f = state.changesState.selectedFile
          selectedFile = newFiles.find(file => file.id === f.id)
      }

      const workingDirectory = new WorkingDirectoryStatus(newFiles, includeAll)
      return {
        selectedSection: state.selectedSection,
        changesState: {
          workingDirectory,
          selectedFile: selectedFile || null,
        },
        historyState: state.historyState,
        committerEmail: state.committerEmail,
        branchesState: state.branchesState,
      }
    })
    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeIncludeAllFiles(repository: Repository, includeAll: boolean): Promise<void> {
    this.updateChangesState(repository, state => {
      return {
        workingDirectory: state.workingDirectory.withIncludeAllFiles(includeAll),
        selectedFile: state.selectedFile,
      }
    })
    this.emitUpdate()

    return Promise.resolve()
  }

  private async refreshCurrentBranch(repository: Repository): Promise<void> {
    const currentBranch = await LocalGitOperations.getCurrentBranch(repository)

    this.updateBranchesState(repository, state => {
      return {
        currentBranch,
        defaultBranch: state.defaultBranch,
        allBranches: state.allBranches,
        recentBranches: state.recentBranches,
        commits: state.commits,
      }
    })
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _refreshRepository(repository: Repository): Promise<void> {
    const state = this.getRepositoryState(repository)

    await this.refreshCurrentBranch(repository)

    await this.loadBranches(repository)

    // When refreshing we *always* load Changes so that we can update the
    // changes indicator in the tab bar. But we only load History if it's
    // selected.
    await this._loadStatus(repository)

    await this.refreshCommitterEmail(repository)

    const section = state.selectedSection
    if (section === RepositorySection.History) {
      return this._loadHistory(repository)
    }
  }

  private async refreshCommitterEmail(repository: Repository): Promise<void> {
    const email = await LocalGitOperations.getConfigValue(repository, 'user.email')
    this.updateRepositoryState(repository, state => {
      return {
        selectedSection: state.selectedSection,
        changesState: state.changesState,
        historyState: state.historyState,
        committerEmail: email,
        branchesState: state.branchesState,
      }
    })
    this.emitUpdate()
  }

  private async loadBranches(repository: Repository): Promise<void> {
    const localBranches = await LocalGitOperations.getBranches(repository, 'refs/heads', BranchType.Local)
    const remoteBranches = await LocalGitOperations.getBranches(repository, 'refs/remotes', BranchType.Remote)

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

    let defaultBranchName: string | null = 'master'
    const gitHubRepository = repository.gitHubRepository
    if (gitHubRepository && gitHubRepository.defaultBranch) {
      defaultBranchName = gitHubRepository.defaultBranch
    }

    const defaultBranch = allBranches.find(b => b.name === defaultBranchName)

    this.updateBranchesState(repository, state => {
      return {
        currentBranch: state.currentBranch,
        defaultBranch: defaultBranch ? defaultBranch : null,
        allBranches,
        recentBranches: state.recentBranches,
        commits: state.commits,
      }
    })
    this.emitUpdate()

    this.calculateRecentBranches(repository)

    this.loadBranchTips(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _showPopup(popup: Popup): Promise<void> {
    this.currentPopup = popup
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _closePopup(): Promise<void> {
    this.currentPopup = null
    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _createBranch(repository: Repository, name: string, startPoint: string): Promise<void> {
    await LocalGitOperations.createBranch(repository, name, startPoint)
    return this._checkoutBranch(repository, name)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _checkoutBranch(repository: Repository, name: string): Promise<void> {
    await LocalGitOperations.checkoutBranch(repository, name)

    return this._refreshRepository(repository)
  }

  private async calculateRecentBranches(repository: Repository): Promise<void> {
    const state = this.getRepositoryState(repository).branchesState
    const recentBranches = await LocalGitOperations.getRecentBranches(repository, state.allBranches, RecentBranchesLimit)
    this.updateBranchesState(repository, state => {
      return {
        currentBranch: state.currentBranch,
        defaultBranch: state.defaultBranch,
        allBranches: state.allBranches,
        recentBranches,
        commits: state.commits,
      }
    })
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _repositoryWithRefreshedGitHubRepository(repository: Repository): Promise<Repository> {
    let gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) {
      gitHubRepository = await this.guessGitHubRepository(repository)
    }

    if (!gitHubRepository) { return repository }

    const users = this.users
    const user = getUserForEndpoint(users, gitHubRepository.endpoint)
    if (!user) { return repository }

    const api = new API(user)
    const apiRepo = await api.fetchRepository(gitHubRepository.owner.login, gitHubRepository.name)
    return repository.withGitHubRepository(gitHubRepository.withAPI(apiRepo))
  }

  private async guessGitHubRepository(repository: Repository): Promise<GitHubRepository | null> {
    // TODO: This is all kinds of wrong. We shouldn't assume the remote is named
    // `origin`.
    const remote = await LocalGitOperations.getConfigValue(repository, 'remote.origin.url')
    if (!remote) { return null }

    return matchGitHubRepository(this.users, remote)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _postError(error: IAppError): Promise<void> {
    const newErrors = Array.from(this.errors)
    newErrors.push(error)
    this.errors = newErrors
    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _clearError(error: IAppError): Promise<void> {
    const newErrors = Array.from(this.errors)
    const index = newErrors.findIndex(e => e === error)
    if (index > -1) {
      newErrors.splice(index, 1)
      this.errors = newErrors
      this.emitUpdate()
    }

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _validatedRepositoryPath(path: string): Promise<string | null> {
    const gitDir = await LocalGitOperations.getGitDir(path)
    if (!gitDir) { return null }

    return Path.dirname(gitDir)
  }

  private async loadBranchTips(repository: Repository): Promise<void> {
    const state = this.getRepositoryState(repository).branchesState
    const commits = state.commits
    for (const branch of state.allBranches) {
      // Immutable 4 lyfe
      if (commits.has(branch.sha)) {
        continue
      }

      const commit = await LocalGitOperations.getCommit(repository, branch.sha)
      if (commit) {
        commits.set(branch.sha, commit)
      }
    }

    // NB: Because the `commits` map is mutable, changing in place, sadness,
    // etc. we don't have to update the state. This feels gross, but concretely
    // it doesn't matter since commits themselves are immutable and we only ever
    // add to the map.
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _renameBranch(repository: Repository, branch: Branch, newName: string): Promise<void> {
    await LocalGitOperations.renameBranch(repository, branch, newName)

    return this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _deleteBranch(repository: Repository, branch: Branch): Promise<void> {
    const defaultBranch = this.getRepositoryState(repository).branchesState.defaultBranch
    if (!defaultBranch) {
      return Promise.reject(new Error(`No default branch!`))
    }

    await LocalGitOperations.checkoutBranch(repository, defaultBranch.name)
    await LocalGitOperations.deleteBranch(repository, branch)

    return this._refreshRepository(repository)
  }

  public async _push(repository: Repository): Promise<void> {
    const remote = await LocalGitOperations.getDefaultRemote(repository)
    if (!remote) {
      this._showPopup({
        type: PopupType.PublishRepository,
        repository
      })
      return
    }

    const state = this.getRepositoryState(repository)
    const branch = state.branchesState.currentBranch
    if (!branch) {
      return Promise.reject(new Error('The current branch is unborn.'))
    }

    const upstream = branch.upstream
    if (upstream) {
      return LocalGitOperations.push(repository, remote, branch.name, false)
    } else {
      return LocalGitOperations.push(repository, remote, branch.name, true)
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _pull(repository: Repository): Promise<void> {
    const remote = await LocalGitOperations.getDefaultRemote(repository)
    if (!remote) {
      return Promise.reject(new Error('The repository has no remotes.'))
    }

    const state = this.getRepositoryState(repository)
    const branch = state.branchesState.currentBranch
    if (!branch) {
      return Promise.reject(new Error('The current branch is unborn.'))
    }

    return LocalGitOperations.pull(repository, remote, branch.name)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _publishRepository(repository: Repository, name: string, description: string, private_: boolean, account: User, org: IAPIUser | null): Promise<void> {
    const api = new API(account)
    const apiRepository = await api.createRepository(org, name, description, private_)

    await LocalGitOperations.addRemote(repository.path, 'origin', apiRepository.cloneUrl)

    return this._push(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _clone(url: string, path: string): { promise: Promise<void>, repository: CloningRepository } {
    const promise = this.cloningRepositoriesStore.clone(url, path)
    const repository = this.cloningRepositoriesStore.repositories.find(r => r.url === url && r.path === path)!
    return { promise, repository }
  }

  public _removeCloningRepository(repository: CloningRepository) {
    this.cloningRepositoriesStore.remove(repository)
  }
}
