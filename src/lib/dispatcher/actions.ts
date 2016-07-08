import Repository, {IRepository} from '../../models/repository'
import {URLActionType} from '../parse-url'

export interface IGetUsersAction {
  name: 'get-users'
}

export interface IGetRepositoriesAction {
  name: 'get-repositories'
}

export interface IAddRepositoriesAction {
  name: 'add-repositories'
  // This union is gross but until Repository can implement IRepository, it's
  // necessary.
  repositories: (Repository | IRepository)[]
}

export interface IRequestOAuthAction {
  name: 'request-oauth'
}

export interface IURLAction {
  name: 'url-action'
  action: URLActionType
}

export interface IRefreshRepositoryAction {
  name: 'refresh-repository'
  // This union is gross but until Repository can implement IRepository, it's
  // necessary.
  repository: Repository | IRepository
}

export type Action = IGetUsersAction | IGetRepositoriesAction |
                     IAddRepositoriesAction | IRequestOAuthAction |
                     IURLAction | IRefreshRepositoryAction
