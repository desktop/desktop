import {ipcRenderer} from 'electron'
import {Emitter, Disposable} from 'event-kit'
import { IHistoryState, IAppState } from '../app-state'
import User, { IUser } from '../../models/user'
import Repository, { IRepository } from '../../models/repository'
import { FileChange } from '../../models/status'
import { Commit } from '../local-git-operations'

export default class LocalStore {
  private emitter: Emitter

  public _history: IHistoryState = {
    commits: new Array<Commit>(),
    selection: {
      commit: null,
      file: null,
    },
    changedFiles: new Array<FileChange>(),
  }

  public _users: ReadonlyArray<User> = new Array<User>()
  public _repositories: ReadonlyArray<Repository> = new Array<Repository>()
  public _selectedRepository: Repository | null

  public _historyByRepositoryID: {[key: number]: IHistoryState }

  private emitQueued = false

  public constructor() {
    this.emitter = new Emitter()
    this._historyByRepositoryID = {}

    ipcRenderer.on('shared/did-update', (event, args) => this.onSharedDidUpdate(event, args))
  }

  private onSharedDidUpdate(event: Electron.IpcRendererEvent, args: any[]) {
    const state: {repositories: ReadonlyArray<IRepository>, users: ReadonlyArray<IUser>} = args[0].state
    this._users = state.users.map(User.fromJSON)
    this._repositories = state.repositories.map(Repository.fromJSON)

    // Update the selected repository. This has two goals:
    //  1. Set it to null if the selected repository was removed.
    //  2. Set the selected repository instance to the same instance as is in
    //     the repositories array. This lets us check for identity instead of
    //     equality.
    const selectedRepository = this._selectedRepository
    if (selectedRepository) {
      let matchingRepository: Repository | null = null
      this._repositories.forEach(r => {
        if (r.id === selectedRepository.id) {
          matchingRepository = r
          return
        }
      })

      this._selectedRepository = matchingRepository
    }

    this._emitUpdate()
  }

  public _emitUpdate() {
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

  public getState(): IAppState {
    return {
      users: this._users,
      repositories: this._repositories,
      history: this._history,
      selectedRepository: this._selectedRepository,
    }
  }
}
