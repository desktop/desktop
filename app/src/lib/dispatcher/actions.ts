import { IRepository } from '../../models/repository'
import { IUser } from '../../models/user'

export interface IGetUsersAction {
  name: 'get-users'
}

export interface IGetRepositoriesAction {
  name: 'get-repositories'
}

export interface IAddRepositoriesAction {
  name: 'add-repositories'
  readonly paths: ReadonlyArray<string>
}

export interface IRemoveRepositoriesAction {
  name: 'remove-repositories'
  readonly repositoryIDs: ReadonlyArray<number>
}

export interface IUpdateGitHubRepositoryAction {
  name: 'update-github-repository'
  readonly repository: IRepository
}

/** Add a user to the app. */
export interface IAddUserAction {
  readonly name: 'add-user'
  readonly user: IUser
}

/** Remove a user from the app. */
export interface IRemoveUserAction {
  readonly name: 'remove-user'
  readonly user: IUser
}

export interface IUpdateRepositoryMissingAction {
  readonly name: 'update-repository-missing'
  readonly repository: IRepository
  readonly missing: boolean
}

export type Action = IGetUsersAction | IGetRepositoriesAction |
                     IAddRepositoriesAction | IUpdateGitHubRepositoryAction |
                     IRemoveRepositoriesAction | IAddUserAction | IRemoveUserAction |
                     IUpdateRepositoryMissingAction
