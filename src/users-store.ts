import {Emitter, Disposable} from 'event-kit'

import {setToken} from './auth'
import User from './user'

export default class UsersStore {
  private emitter: Emitter
  private users: User[]

  public constructor() {
    this.emitter = new Emitter()
    this.users = []
  }

  public onUsersChanged(fn: (users: User[]) => void): Disposable {
    return this.emitter.on('users-changed', fn)
  }

  private usersDidChange() {
    this.emitter.emit('users-changed', this.users)
  }

  public getUsers(): User[] {
    return this.users
  }

  public addUser(user: User) {
    setToken(user.login, user.token)

    this.users.push(user)
    this.usersDidChange()
  }

  public loadFromDisk() {
    // TODO: actually do it
  }
}
