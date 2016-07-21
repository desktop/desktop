import {IRepository} from '../../models/repository'
import {URLActionType} from '../parse-url'

export interface GetUsersAction {
  name: 'get-users'
}

export interface GetRepositoriesAction {
  name: 'get-repositories'
}

export interface AddRepositoriesAction {
  name: 'add-repositories'
  readonly repositories: ReadonlyArray<IRepository>
}

export interface RequestOAuthAction {
  name: 'request-oauth'
}

export interface URLAction {
  name: 'url-action'
  readonly action: URLActionType
}

export interface UpdateGitHubRepositoryAction {
  name: 'update-github-repository'
  readonly repository: IRepository
}

export type Action = GetUsersAction | GetRepositoriesAction |
                     AddRepositoriesAction | RequestOAuthAction |
                     URLAction | UpdateGitHubRepositoryAction
