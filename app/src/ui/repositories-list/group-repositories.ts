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
import { enableGroupRepositoriesByOwner } from '../../lib/feature-flag'

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
}

const fallbackValue = {
  changedFilesCount: 0,
  aheadBehind: null,
}

export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>
): ReadonlyArray<IFilterListGroup<IRepositoryListItem>> {
  const grouped = new Map<RepositoryGroupIdentifier, Repositoryish[]>()
  const gitHubOwners: Array<string> = []
  for (const repository of repositories) {
    const gitHubRepository =
      repository instanceof Repository ? repository.gitHubRepository : null
    let group: RepositoryGroupIdentifier = KnownRepositoryGroup.NonGitHub
    if (gitHubRepository) {
      if (gitHubRepository.endpoint === getDotComAPIEndpoint()) {
        if (enableGroupRepositoriesByOwner()) {
          group = gitHubRepository.owner.login
          gitHubOwners.push(group)
        } else {
          group = 'GitHub.com'
        }
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

    repositories.sort((x, y) => caseInsensitiveCompare(x.name, y.name))
    const items: ReadonlyArray<IRepositoryListItem> = repositories.map(r => {
      const nameCount = names.get(r.name) || 0
      const { aheadBehind, changedFilesCount } =
        localRepositoryStateLookup.get(r.id) || fallbackValue
      const repositoryText =
        r instanceof Repository ? [r.name, nameOf(r)] : [r.name]
      if (enableGroupRepositoriesByOwner()) {
        return {
          text: repositoryText,
          id: r.id.toString(),
          repository: r,
          needsDisambiguation:
            nameCount > 1 && identifier === KnownRepositoryGroup.Enterprise,
          aheadBehind,
          changedFilesCount,
        }
      }
      return {
        text: [r.name],
        id: r.id.toString(),
        repository: r,
        needsDisambiguation: nameCount > 1,
        aheadBehind,
        changedFilesCount,
      }
    })

    groups.push({ identifier, items })
  }

  // NB: This ordering reflects the order in the repositories sidebar.
  if (enableGroupRepositoriesByOwner()) {
    const owners = gitHubOwners.reduce((acc, val) => {
      if (!acc.includes(val)) {
        acc.push(val)
      }
      return acc
    }, new Array<string>())
    owners.sort(caseInsensitiveCompare).forEach(o => {
      addGroup(o)
    })
  } else {
    addGroup('GitHub.com')
  }
  addGroup(KnownRepositoryGroup.Enterprise)
  addGroup(KnownRepositoryGroup.NonGitHub)

  return groups
}
