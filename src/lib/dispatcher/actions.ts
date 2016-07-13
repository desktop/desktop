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
  repositories: IRepository[]
}

export interface RequestOAuthAction {
  name: 'request-oauth'
}

export interface URLAction {
  name: 'url-action'
  action: URLActionType
}

export interface UpdateGitHubRepositoryAction {
  name: 'update-github-repository'
  repository: IRepository
}

export type Action = GetUsersAction | GetRepositoriesAction |
                     AddRepositoriesAction | RequestOAuthAction |
                     URLAction | UpdateGitHubRepositoryAction
