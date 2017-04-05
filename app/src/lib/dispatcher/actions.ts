import { IRepository } from '../../models/repository'
import { IAccount } from '../../models/account'

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
  readonly user: IAccount
}

/** Remove a user from the app. */
export interface IRemoveUserAction {
  readonly name: 'remove-user'
  readonly user: IAccount
}

/** Change a repository's `missing` status. */
export interface IUpdateRepositoryMissingAction {
  readonly name: 'update-repository-missing'
  readonly repository: IRepository
  readonly missing: boolean
}

/** Change a repository's path. */
export interface IUpdateRepositoryPathAction {
  readonly name: 'update-repository-path'
  readonly repository: IRepository
  readonly path: string
}

export type Action = IGetUsersAction | IGetRepositoriesAction |
                     IAddRepositoriesAction | IUpdateGitHubRepositoryAction |
                     IRemoveRepositoriesAction | IAddUserAction | IRemoveUserAction |
                     IUpdateRepositoryMissingAction | IUpdateRepositoryPathAction
