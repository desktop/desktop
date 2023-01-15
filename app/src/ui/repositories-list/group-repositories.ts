import {
  Repository,
  ILocalRepositoryState,
  nameOf,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { getDotComAPIEndpoint } from '../../lib/api'
import { caseInsensitiveCompare } from '../../lib/compare'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IAheadBehind } from '../../models/branch'
import path from 'path'

/**
 * Special, reserved repository group names
 *
 * (GitHub.com user and org names cannot contain `_`,
 * so these are safe to union with all possible
 * GitHub repo owner names)
 */
export enum KnownRepositoryGroup {
  Enterprise = '_Enterprise_',
  NonGitHub = '_Non-GitHub_',
}

export type RepositoryGroupIdentifier = KnownRepositoryGroup | string

export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly repository: Repositoryish
  readonly needsDisambiguation: boolean
  readonly minimalUniquePrefix: string | null
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
}

const fallbackValue = {
  changedFilesCount: 0,
  aheadBehind: null,
}

function minimalPrefix(r: Repositoryish, paths: string[]) {
  const ownPath = r.path
  const otherPaths = paths.filter(p => p !== ownPath)
  const ownWithoutBasename = path.parse(ownPath).dir
  const othersWithoutBasename = otherPaths.map(p => path.parse(p).dir)
  const parts = ownWithoutBasename.split(path.sep)
  const othersParts = othersWithoutBasename.map(p => p.split(path.sep))

  const prefixParts = []
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    prefixParts.unshift(part)
    if (othersParts.some(other => other[other.length - 1] === part)) {
      othersParts.forEach(other => other.pop())
      continue
    }
    break
  }

  const minimalPrefix = prefixParts.join(path.sep)
  return minimalPrefix.length !== 0 ? minimalPrefix : null
}

export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>
): ReadonlyArray<IFilterListGroup<IRepositoryListItem>> {
  const grouped = new Map<RepositoryGroupIdentifier, Repositoryish[]>()
  const gitHubOwners = new Set<string>()
  for (const repository of repositories) {
    const gitHubRepository =
      repository instanceof Repository ? repository.gitHubRepository : null
    let group: RepositoryGroupIdentifier = KnownRepositoryGroup.NonGitHub
    if (gitHubRepository) {
      if (gitHubRepository.endpoint === getDotComAPIEndpoint()) {
        group = gitHubRepository.owner.login
        gitHubOwners.add(group)
      } else {
        group = KnownRepositoryGroup.Enterprise
      }
    } else {
      group = KnownRepositoryGroup.NonGitHub
    }

    let repositories = grouped.get(group)
    if (!repositories) {
      repositories = new Array<Repository>()
      grouped.set(group, repositories)
    }

    repositories.push(repository)
  }

  const groups = new Array<IFilterListGroup<IRepositoryListItem>>()

  const addGroup = (identifier: RepositoryGroupIdentifier) => {
    const repositories = grouped.get(identifier)
    if (!repositories || repositories.length === 0) {
      return
    }

    const pathsByNames = new Map<string, string[]>()
    for (const repository of repositories) {
      const existingPaths: string[] = pathsByNames.get(repository.name) || []
      existingPaths.push(repository.path)
      pathsByNames.set(repository.name, existingPaths)
    }

    repositories.sort((x, y) =>
      caseInsensitiveCompare(repositorySortingKey(x), repositorySortingKey(y))
    )

    const items: ReadonlyArray<IRepositoryListItem> = repositories.map(r => {
      const nameCount = pathsByNames.get(r.name)?.length || 0
      const minimalUniquePrefix =
        nameCount > 1 ? minimalPrefix(r, pathsByNames.get(r.name)!) : null
      const { aheadBehind, changedFilesCount } =
        localRepositoryStateLookup.get(r.id) || fallbackValue
      const repositoryText =
        r instanceof Repository ? [r.alias ?? r.name, nameOf(r)] : [r.name]

      return {
        text: repositoryText,
        id: r.id.toString(),
        repository: r,
        needsDisambiguation: nameCount > 1,
        minimalUniquePrefix: minimalUniquePrefix,
        aheadBehind,
        changedFilesCount,
      }
    })

    groups.push({ identifier, items })
  }

  // NB: This ordering reflects the order in the repositories sidebar.
  const owners = [...gitHubOwners.values()]
  owners.sort(caseInsensitiveCompare)
  owners.forEach(addGroup)

  addGroup(KnownRepositoryGroup.Enterprise)
  addGroup(KnownRepositoryGroup.NonGitHub)

  return groups
}

/**
 * Creates the group `Recent` of repositories recently opened for use with `FilterList` component
 *
 * @param recentRepositories list of recent repositories' ids
 * @param repositories full list of repositories (we use this to get data about the `recentRepositories`)
 * @param localRepositoryStateLookup cache of local state about full list of repositories (we use this to get data about the `recentRepositories`)
 */
export function makeRecentRepositoriesGroup(
  recentRepositories: ReadonlyArray<number>,
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>
): IFilterListGroup<IRepositoryListItem> {
  const pathsByNames = new Map<string, string[]>()
  for (const id of recentRepositories) {
    const repository = repositories.find(r => r.id === id)
    if (repository !== undefined) {
      const alias = repository instanceof Repository ? repository.alias : null
      const name = alias ?? repository.name

      const existingPaths: string[] = pathsByNames.get(name) || []
      existingPaths.push(repository.path)
      pathsByNames.set(name, existingPaths)
    }
  }

  const items = new Array<IRepositoryListItem>()

  for (const id of recentRepositories) {
    const repository = repositories.find(r => r.id === id)
    if (repository === undefined) {
      continue
    }

    const { aheadBehind, changedFilesCount } =
      localRepositoryStateLookup.get(id) || fallbackValue
    const repositoryAlias =
      repository instanceof Repository ? repository.alias : null
    const repositoryText =
      repository instanceof Repository
        ? [repositoryAlias ?? repository.name, nameOf(repository)]
        : [repository.name]
    const nameCount = pathsByNames.get(repository.name)?.length || 0
    const minimalUniquePrefix =
      nameCount > 1
        ? minimalPrefix(repository, pathsByNames.get(repository.name)!)
        : null
    items.push({
      text: repositoryText,
      id: id.toString(),
      repository,
      needsDisambiguation: nameCount > 1,
      minimalUniquePrefix: minimalUniquePrefix,
      aheadBehind,
      changedFilesCount,
    })
  }

  return {
    identifier: 'Recent',
    items,
  }
}

// Use either the configured alias or the repository name when sorting the
// repository list.
const repositorySortingKey = (r: Repositoryish) =>
  r instanceof Repository && r.alias !== null ? r.alias : r.name
