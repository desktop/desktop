import * as Path from 'path'
import { IUser, IRepository, IGHRepository, IPullRequest } from '.'
import { IRepositoryAPIResult, IPullRequestAPIResult } from '../lib/api'

export type RepositoryKey = { name: string; path: string }

export function keyOf(repository: IRepository): RepositoryKey {
  return {
    name: repository.name,
    path: repository.path,
  }
}

export function getFullName(repository: IGHRepository | IRepository) {
  let name: string = repository.name

  if (repository.kind === 'repository') {
    name =
      repository.ghRepository == null
        ? repository.name || Path.basename(repository.path)
        : `${repository.ghRepository.owner.login}/${repository.name}`
  } else if (repository.kind === 'gh-repository') {
    name = `${repository.owner.login}/${repository.name}`
  }

  return name
}

export function computeUserHash(user: IUser): string {
  return `${user.login}+${user.endpoint}+${user.avatarUrl}`
}

export function computeGHRepositoryHash(ghRepo: IGHRepository): string {
  return `${ghRepo.defaultBranch}+
      ${ghRepo.isPrivate}+
      ${ghRepo.cloneUrl}+
      ${ghRepo.name}+
      ${ghRepo.htmlUrl}+
      ${computeUserHash(ghRepo.owner)}+
      ${ghRepo.parent && computeGHRepositoryHash(ghRepo.parent)}`
}

export function computeRepositoryHash(repo: IRepository): string {
  return `${repo.name}+
      ${repo.path}+
      ${repo.isMissing}+
      ${repo.ghRepository && computeGHRepositoryHash(repo.ghRepository)}`
}

export function isFork(ghRepository: IGHRepository) {
  return ghRepository.parent != null
}

export function getEndpoint(repository: IGHRepository): string {
  return repository.owner.endpoint
}

export function createRepositoryModel(
  path: string,
  isMissing: boolean = false,
  ghRepository?: IGHRepository
): IRepository {
  const model: IRepository = {
    kind: 'repository',
    name: (ghRepository && ghRepository.name) || Path.basename(path),
    path,
    isMissing,
    ghRepository,
  }

  return model
}

export function toRepositoryModel(document: IRepository & LokiObj) {
  const result: IRepository = {
    kind: 'repository',
    name: document.name,
    path: document.path,
    isMissing: document.isMissing,
    ghRepository: document.ghRepository,
  }

  return result
}

export function toGHRepositoryModel(
  apiResult: IRepositoryAPIResult,
  endpoint?: string
): IGHRepository {
  const ghRepo: IGHRepository = {
    kind: 'gh-repository',
    name: apiResult.name,
    defaultBranch: apiResult.default_branch,
    isPrivate: apiResult.private,
    cloneUrl: apiResult.clone_url,
    htmlUrl: apiResult.html_url,
    owner: {
      name: apiResult.owner.name,
      login: apiResult.owner.login,
      email: apiResult.owner.email,
      endpoint: endpoint || '', // what is endpoint?
      avatarUrl: apiResult.owner.avatar_url,
    },
    parent: apiResult.parent && toGHRepositoryModel(apiResult.parent), // where do forked repos get their endpoint from
    issues: [],
    mentionables: [],
    pullRequests: [],
  }

  return ghRepo
}

export function toPullRequestModel(
  apiResult: IPullRequestAPIResult
): IPullRequest {
  const model: IPullRequest = {
    number: apiResult.number,
    title: apiResult.title,
    createdAt: apiResult.created_at,
    head: {
      ref: apiResult.head.ref,
      sha: apiResult.head.sha,
    },
    base: {
      ref: apiResult.base.ref,
      sha: apiResult.base.sha,
    },
    author: apiResult.user.login,
  }

  return model
}
