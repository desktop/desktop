import { IRepository } from '../../models/repository'
import { URLActionType } from '../parse-url'
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

export interface IRequestOAuthAction {
  name: 'request-oauth'
}

export interface IURLAction {
  name: 'url-action'
  readonly action: URLActionType
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

export type Action = IGetUsersAction | IGetRepositoriesAction |
                     IAddRepositoriesAction | IRequestOAuthAction |
                     IURLAction | IUpdateGitHubRepositoryAction |
                     IRemoveRepositoriesAction | IAddUserAction
