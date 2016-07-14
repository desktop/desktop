import User from '../models/user'
import Repository from '../models/repository'

/** All of the shared app state. */
export interface AppState {
  readonly users: User[]
  readonly repositories: Repository[]
}
