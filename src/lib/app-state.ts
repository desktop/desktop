import User from '../models/user'
import Repository from '../models/repository'

/** All of the shared app state. */
export interface IAppState {
  users: User[]
  repositories: Repository[]
}
