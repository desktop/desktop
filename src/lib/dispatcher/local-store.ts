import {ipcRenderer} from 'electron'
import {Emitter, Disposable} from 'event-kit'
import { IHistoryState, AppState } from '../app-state'
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

  public constructor() {
    this.emitter = new Emitter()

    ipcRenderer.on('shared/did-update', (event, args) => this.onSharedDidUpdate(event, args))
  }

  private onSharedDidUpdate(event: Electron.IpcRendererEvent, args: any[]) {
    const state: {repositories: ReadonlyArray<IRepository>, users: ReadonlyArray<IUser>} = args[0].state
    this._users = state.users.map(User.fromJSON)
    this._repositories = state.repositories.map(Repository.fromJSON)
    this._emitUpdate()
  }

  public _emitUpdate() {
    this.emitter.emit('did-update', this.getAppState())
  }

  public onDidUpdate(fn: (state: AppState) => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  public getAppState(): AppState {
    return {
      users: this._users,
      repositories: this._repositories,
      history: this._history,
    }
  }
}
