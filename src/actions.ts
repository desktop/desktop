import Repository from './models/repository'

export interface GetUsersAction {
  name: 'get-users'
}

export interface GetRepositoriesAction {
  name: 'get-repositories'
}

export interface AddRepositoryAction {
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

export type Action = GetUsersAction | GetRepositoriesAction |
                     AddRepositoryAction | RequestOAuthAction |
                     FindGitHubRepositoryAction
