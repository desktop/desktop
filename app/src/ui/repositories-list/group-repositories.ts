import { Repository } from '../../models/repository'
import { getDotComAPIEndpoint } from '../../lib/api'
import { CloningRepository } from '../../lib/dispatcher'
import { caseInsenstiveCompare } from '../../lib/compare'

export type RepositoryGroup = 'github' | 'enterprise' | 'other'

export type Repositoryish = Repository | CloningRepository

export type RepositoryListItemModel =
  | { kind: 'repository', repository: Repositoryish }
  | { kind: 'label', label: string }

export function groupRepositories(repositories: ReadonlyArray<Repositoryish>): ReadonlyArray<RepositoryListItemModel> {
  const grouped = new Map<RepositoryGroup, Repositoryish[]>()
  repositories.forEach(repository => {
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
  })

  const flattened = new Array<RepositoryListItemModel>()

  const addGroup = (group: RepositoryGroup) => {
    const repositories = grouped.get(group)
    if (!repositories || repositories.length === 0) { return }

    let label = 'Other'
    if (group === 'github') {
      label = 'GitHub'
    } else if (group === 'enterprise') {
      label = 'Enterprise'
    }
    flattened.push({ kind: 'label', label })

    repositories.sort((x, y) => caseInsenstiveCompare(x.name, y.name))

    for (const repository of repositories) {
      flattened.push({ kind: 'repository', repository })
    }
  }

  addGroup('github')
  addGroup('enterprise')
  addGroup('other')

  return flattened
}
