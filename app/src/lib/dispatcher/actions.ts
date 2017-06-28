import { IRepository } from '../../models/repository'
import { IAccount } from '../../models/account'

export interface IGetAccountsAction {
  name: 'get-accounts'
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
export interface IAddAccountAction {
  readonly name: 'add-account'
  readonly account: IAccount
}

/** Remove a user from the app. */
export interface IRemoveAccountAction {
  readonly name: 'remove-account'
  readonly account: IAccount
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

export type Action =
  | IGetAccountsAction
  | IGetRepositoriesAction
  | IAddRepositoriesAction
  | IUpdateGitHubRepositoryAction
  | IRemoveRepositoriesAction
  | IAddAccountAction
  | IRemoveAccountAction
  | IUpdateRepositoryMissingAction
  | IUpdateRepositoryPathAction
