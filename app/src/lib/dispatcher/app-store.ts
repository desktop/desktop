import { Emitter, Disposable } from 'event-kit'
import { IRepositoryState, IHistoryState, IHistorySelection, IAppState, RepositorySection } from '../app-state'
import User from '../../models/user'
import Repository from '../../models/repository'
import { FileChange, WorkingDirectoryStatus, WorkingDirectoryFileChange } from '../../models/status'
import { LocalGitOperations, Commit } from '../local-git-operations'
import { findIndex } from '../find'

export default class AppStore {
  private emitter = new Emitter()

  private users: ReadonlyArray<User> = new Array<User>()
  private repositories: ReadonlyArray<Repository> = new Array<Repository>()
  private selectedRepository: Repository | null

  private repositoryState = new Map<number, IRepositoryState>()

  private emitQueued = false

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
        changedFiles: new Array<FileChange>(),
      },
      changesState: {
        workingDirectory: new WorkingDirectoryStatus(new Array<WorkingDirectoryFileChange>(), true),
        selectedPath: null,
      },
      selectedSection: RepositorySection.History,
    }
  }

  private getRepositoryState(repository: Repository): IRepositoryState {
    let state = this.repositoryState.get(repository.id!)
    if (state) { return state }

    state = this.getInitialRepositoryState()
    this.repositoryState.set(repository.id!, state)
    return state
  }

  private updateRepositoryState(repository: Repository, state: IRepositoryState) {
    this.repositoryState.set(repository.id!, state)
  }

  private updateHistoryState(repository: Repository, historyState: IHistoryState) {
    const currentState = this.getRepositoryState(repository)
    const newState: IRepositoryState = {
      historyState,
      changesState: currentState.changesState,
      selectedSection: currentState.selectedSection,
    }

    this.updateRepositoryState(repository, newState)
  }

  private getCurrentRepositoryState(): IRepositoryState | null {
    const repository = this.selectedRepository
    if (!repository) { return null }

    return this.getRepositoryState(repository)
  }

  public getState(): IAppState {
    return {
      users: this.users,
      repositories: this.repositories,
      repositoryState: this.getCurrentRepositoryState(),
      selectedRepository: this.selectedRepository,
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadHistory(repository: Repository): Promise<void> {
    const commits = await LocalGitOperations.getHistory(repository)
    const state = this.getRepositoryState(repository)
    const historyState = state.historyState

    const newHistory = {
      commits,
      selection: historyState.selection,
      changedFiles: historyState.changedFiles,
    }
    this.updateHistoryState(repository, newHistory)
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

    const newHistory = {
      commits: state.historyState.commits,
      selection,
      changedFiles,
    }
    this.updateHistoryState(repository, newHistory)
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeHistorySelection(repository: Repository, selection: IHistorySelection): Promise<void> {
    const state = this.getRepositoryState(repository)
    const commitChanged = state.historyState.selection.commit !== selection.commit
    const changedFiles = commitChanged ? new Array<FileChange>() : state.historyState.changedFiles

    const newHistory = {
      commits: state.historyState.commits,
      selection,
      changedFiles,
    }
    this.updateHistoryState(repository, newHistory)
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _selectRepository(repository: Repository | null): Promise<void> {
    this.selectedRepository = repository
    this.emitUpdate()

    if (repository) {
      this._changeRepositorySection(repository, this.getCurrentRepositoryState()!.selectedSection)
    }
  }

  public _loadFromSharedProcess(users: ReadonlyArray<User>, repositories: ReadonlyArray<Repository>) {
    this.users = users
    this.repositories = repositories

    const selectedRepository = this.selectedRepository
    let newSelectedRepository: Repository | null = this.selectedRepository
    if (selectedRepository) {
      const i = findIndex(this.repositories, r => r.id === selectedRepository.id)
      if (i === -1) {
        newSelectedRepository = null
      }
    }

    if (!this.selectedRepository && this.repositories.length > 0) {
      newSelectedRepository = this.repositories[0]
    }

    if (newSelectedRepository !== selectedRepository) {
      this._selectRepository(newSelectedRepository)
    }

    this.emitUpdate()
  }

  public async _loadStatus(repository: Repository): Promise<void> {
    let workingDirectory = new WorkingDirectoryStatus(new Array<WorkingDirectoryFileChange>(), true)
    try {
      const status = await LocalGitOperations.getStatus(repository)
      workingDirectory = status.workingDirectory
    } catch (e) {
      console.error(e)
    }

    const currentState = this.getRepositoryState(repository)
    const newState: IRepositoryState = {
      historyState: currentState.historyState,
      changesState: {
        workingDirectory,
        selectedPath: null,
      },
      selectedSection: currentState.selectedSection,
    }
    this.updateRepositoryState(repository, newState)
    this.emitUpdate()
  }

  public async _changeRepositorySection(repository: Repository, section: RepositorySection): Promise<void> {
    const currentState = this.getRepositoryState(repository)
    const newState: IRepositoryState = {
      historyState: currentState.historyState,
      changesState: currentState.changesState,
      selectedSection: section,
    }
    this.updateRepositoryState(repository, newState)
    this.emitUpdate()

    if (section === RepositorySection.History) {
      return this._loadHistory(repository)
    } else if (section === RepositorySection.Changes) {
      return this._loadStatus(repository)
    }
  }

  public _changeChangesSelection(repository: Repository, selectedPath: string | null): Promise<void> {
    const currentState = this.getRepositoryState(repository)
    const newState: IRepositoryState = {
      historyState: currentState.historyState,
      changesState: {
        workingDirectory: currentState.changesState.workingDirectory,
        selectedPath,
      },
      selectedSection: currentState.selectedSection,
    }
    this.updateRepositoryState(repository, newState)
    this.emitUpdate()

    return Promise.resolve()
  }

  public async _commitSelectedChanges(repository: Repository, title: string): Promise<void> {
    const state = this.getRepositoryState(repository)
    const files = state.changesState.workingDirectory.files.filter(function(file, index, array) {
      return file.include === true
    })

    await LocalGitOperations.createCommit(repository, title, files)

    return this._loadStatus(repository)
  }

  public async _changeChangedFiles(repository: Repository, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<void> {
    const state = this.getRepositoryState(repository)

    const allSelected = files.every((f, index, array) => {
      return f.include
    })

    const noneSelected = files.every((f, index, array) => {
      return !f.include
    })

    let includeAll: boolean | null = null
    if (allSelected) {
      includeAll = true
    } else if (noneSelected) {
      includeAll = false
    }

    const newState: IRepositoryState = {
      selectedSection: state.selectedSection,
      changesState: {
        workingDirectory: new WorkingDirectoryStatus(files, includeAll),
        selectedPath: state.changesState.selectedPath,
      },
      historyState: state.historyState,
    }

    this.updateRepositoryState(repository, newState)
    this.emitUpdate()

    return Promise.resolve()
  }

  public _changeIncludeAllFiles(repository: Repository, includeAll: boolean): Promise<void> {
    const state = this.getRepositoryState(repository)
    const newState: IRepositoryState = {
      selectedSection: state.selectedSection,
      changesState: {
        workingDirectory: state.changesState.workingDirectory.withIncludeAllFiles(includeAll),
        selectedPath: state.changesState.selectedPath,
      },
      historyState: state.historyState,
    }

    this.updateRepositoryState(repository, newState)
    this.emitUpdate()

    return Promise.resolve()
  }
}
