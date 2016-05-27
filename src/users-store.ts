import {Emitter, Disposable} from 'event-kit'

import {setToken, getToken} from './auth'
import User from './user'

export default class UsersStore {
  private emitter: Emitter
  private users: User[]

  private persisted: boolean

  public constructor() {
    this.emitter = new Emitter()
    this.users = []
    this.persisted = false
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

    if (this.persisted) {
      this.saveToDisk()
    }
  }

  public loadFromDisk() {
    this.persisted = true

    const raw = localStorage.getItem('users')
    if (!raw || !raw.length) {
      return
    }

    const rawUsers: User[] = JSON.parse(raw)
    const usersWithTokens = rawUsers.map(user => new User(user.login, getToken(user.login)))
    this.users = usersWithTokens

    this.usersDidChange()
  }

  private saveToDisk() {
    const usersWithoutTokens = this.users.map(user => new User(user.login, ''))
    localStorage.setItem('users', JSON.stringify(usersWithoutTokens))
  }
}
