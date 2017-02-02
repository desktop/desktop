import { Repository } from '../../models/repository'
import { getDotComAPIEndpoint } from '../../lib/api'
import { CloningRepository } from '../../lib/dispatcher'
import { caseInsenstiveCompare } from '../../lib/compare'
import { IFoldoutListGroup } from '../lib/foldout-list'

export type RepositoryGroup = 'github' | 'enterprise' | 'other'

export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem {
  readonly text: string
  readonly id: string
  readonly repository: Repositoryish
}

export function groupRepositories(repositories: ReadonlyArray<Repositoryish>): ReadonlyArray<IFoldoutListGroup<IRepositoryListItem>> {
  const grouped = new Map<RepositoryGroup, Repositoryish[]>()
  for (const repository of repositories) {
    const gitHubRepository = repository instanceof Repository ? repository.gitHubRepository : null
    let group: RepositoryGroup = 'other'
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

  const groups = new Array<IFoldoutListGroup<IRepositoryListItem>>()

  const addGroup = (group: RepositoryGroup) => {
    const repositories = grouped.get(group)
    if (!repositories || repositories.length === 0) { return }

    let label = 'Other'
    if (group === 'github') {
      label = 'GitHub'
    } else if (group === 'enterprise') {
      label = 'Enterprise'
    }

    repositories.sort((x, y) => caseInsenstiveCompare(x.name, y.name))
    const items = repositories.map(r => ({
      text: r.name,
      id: r.id.toString(),
      repository: r,
    }))

    groups.push({ label, items })
  }

  addGroup('github')
  addGroup('enterprise')
  addGroup('other')

  return groups
}
