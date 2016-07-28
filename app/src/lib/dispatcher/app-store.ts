import { ipcRenderer } from 'electron'
import { Emitter, Disposable } from 'event-kit'
import { IRepositoryState, IHistoryState, IHistorySelection, IAppState } from '../app-state'
import User, { IUser } from '../../models/user'
import Repository, { IRepository } from '../../models/repository'
import { FileChange } from '../../models/status'
import { LocalGitOperations, Commit } from '../local-git-operations'
import findIndex from '../find-index'

export default class AppStore {
  private emitter: Emitter

  private users: ReadonlyArray<User> = new Array<User>()
  private repositories: ReadonlyArray<Repository> = new Array<Repository>()
  private selectedRepository: Repository | null

  private repositoryStateByRepositoryID: {[key: number]: IRepositoryState }

  private emitQueued = false

  public constructor() {
    this.emitter = new Emitter()
    this.repositoryStateByRepositoryID = {}

    ipcRenderer.on('shared/did-update', (event, args) => this.onSharedDidUpdate(event, args))
  }

  private onSharedDidUpdate(event: Electron.IpcRendererEvent, args: any[]) {
    const state: {repositories: ReadonlyArray<IRepository>, users: ReadonlyArray<IUser>} = args[0].state
    this.users = state.users.map(User.fromJSON)
    this.repositories = state.repositories.map(Repository.fromJSON)

    // Update the selected repository. This has two goals:
    //  1. Set it to null if the selected repository was removed.
    //  2. Set the selected repository instance to the same instance as is in
    //     the repositories array. This lets us check for identity instead of
    //     equality.
    const selectedRepository = this.selectedRepository
    if (selectedRepository) {
      const i = findIndex(this.repositories, r => r.id === selectedRepository.id)
      if (i > -1) {
        this.selectedRepository = this.repositories[i]
      } else {
        this.selectedRepository = null
      }
    }

    this.emitUpdate()
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

  private getRepositoryState(repository: Repository): IRepositoryState {
    let state = this.repositoryStateByRepositoryID[repository.id!]
    if (state) { return state }

    state = {
      historyState: {
        selection: {
          commit: null,
          file: null,
        },
        commits: new Array<Commit>(),
        changedFiles: new Array<FileChange>(),
      }
    }
    this.repositoryStateByRepositoryID[repository.id!] = state
    return state
  }

  private updateHistoryState(repository: Repository, historyState: IHistoryState) {
    this.repositoryStateByRepositoryID[repository.id!] = { historyState }
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
  public async _selectRepository(repository: Repository): Promise<void> {
    this.selectedRepository = repository
    this.emitUpdate()

    await this._loadHistory(repository)
    this.emitUpdate()
  }

  public _loadInitialState(users: ReadonlyArray<User>, repositories: ReadonlyArray<Repository>) {
    this.users = users
    this.repositories = repositories
    this.emitUpdate()
  }
}
