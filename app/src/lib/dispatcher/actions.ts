import { IRepository } from '../../models/repository'
import { URLActionType } from '../parse-url'

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

export type Action = IGetUsersAction | IGetRepositoriesAction |
                     IAddRepositoriesAction | IRequestOAuthAction |
                     IURLAction | IUpdateGitHubRepositoryAction
