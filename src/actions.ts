import Repository from './models/repository'
import {URLActionType} from './lib/parse-url'

export interface GetUsersAction {
  name: 'get-users'
}

export interface GetRepositoriesAction {
  name: 'get-repositories'
}

export interface AddRepositoriesAction {
  name: 'add-repositories'
  repositories: Repository[]
}

export interface RequestOAuthAction {
  name: 'request-oauth'
}

export interface FindGitHubRepositoryAction {
  name: 'find-github-repository'
  remoteURL: string
}

export interface URLAction {
  name: 'url-action'
  action: URLActionType
}

export type Action = GetUsersAction | GetRepositoriesAction |
                     AddRepositoriesAction | RequestOAuthAction |
                     FindGitHubRepositoryAction
