import Repository, {IRepository} from '../../models/repository'
import {URLActionType} from '../parse-url'

export interface GetUsersAction {
  name: 'get-users'
}

export interface GetRepositoriesAction {
  name: 'get-repositories'
}

export interface AddRepositoriesAction {
  name: 'add-repositories'
  // This union is gross but until Repository can implement IRepository, it's
  // necessary.
  repositories: (Repository | IRepository)[]
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
  // This union is gross but until Repository can implement IRepository, it's
  // necessary.
  repository: Repository | IRepository
}

export type Action = GetUsersAction | GetRepositoriesAction |
                     AddRepositoriesAction | RequestOAuthAction |
                     URLAction | UpdateGitHubRepositoryAction
