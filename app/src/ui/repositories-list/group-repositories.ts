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
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
  readonly currentBranch: string | null
}

const fallbackValue = {
  changedFilesCount: 0,
  aheadBehind: null,
  currentBranch: null,
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

    const names = new Map<string, number>()
    for (const repository of repositories) {
      const existingCount = names.get(repository.name) || 0
      names.set(repository.name, existingCount + 1)
    }

    repositories.sort((x, y) =>
      caseInsensitiveCompare(repositorySortingKey(x), repositorySortingKey(y))
    )
    const items: ReadonlyArray<IRepositoryListItem> = repositories.map(r => {
      const nameCount = names.get(r.name) || 0
      const { aheadBehind, changedFilesCount, currentBranch } =
        localRepositoryStateLookup.get(r.id) || fallbackValue
      const repositoryText =
        r instanceof Repository ? [r.alias ?? r.name, nameOf(r)] : [r.name]

      return {
        text: repositoryText,
        id: r.id.toString(),
        repository: r,
        needsDisambiguation:
          nameCount > 1 && identifier === KnownRepositoryGroup.Enterprise,
        aheadBehind,
        changedFilesCount,
        currentBranch
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
  const names = new Map<string, number>()
  for (const id of recentRepositories) {
    const repository = repositories.find(r => r.id === id)
    if (repository !== undefined) {
      const alias = repository instanceof Repository ? repository.alias : null
      const name = alias ?? repository.name
      const existingCount = names.get(name) || 0
      names.set(name, existingCount + 1)
    }
  }

  const items = new Array<IRepositoryListItem>()

  for (const id of recentRepositories) {
    const repository = repositories.find(r => r.id === id)
    if (repository === undefined) {
      continue
    }

    const { aheadBehind, changedFilesCount, currentBranch } =
      localRepositoryStateLookup.get(id) || fallbackValue
    const repositoryAlias =
      repository instanceof Repository ? repository.alias : null
    const repositoryText =
      repository instanceof Repository
        ? [repositoryAlias ?? repository.name, nameOf(repository)]
        : [repository.name]
    const nameCount = names.get(repositoryAlias ?? repository.name) || 0
    items.push({
      text: repositoryText,
      id: id.toString(),
      repository,
      needsDisambiguation: nameCount > 1,
      aheadBehind,
      changedFilesCount,
      currentBranch,
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
