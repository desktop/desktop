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

export type RepositoryGroupIdentifier = 'github' | 'enterprise' | 'other'

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
  for (const repository of repositories) {
    const gitHubRepository =
      repository instanceof Repository ? repository.gitHubRepository : null
    let group: RepositoryGroupIdentifier = 'other'
    if (gitHubRepository) {
      if (gitHubRepository.endpoint === getDotComAPIEndpoint()) {
        group = 'github'
      } else {
        group = 'enterprise'
      }
    } else {
      group = 'other'
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
      return {
        text: repositoryText,
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
  addGroup('github')
  addGroup('enterprise')
  addGroup('other')

  return groups
}
