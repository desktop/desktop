import Repository from '../../models/repository'
import { getDotComAPIEndpoint } from '../../lib/api'

export type RepositoryGroup = 'github' | 'enterprise' | 'other'

export type RepositoryListItem = { kind: 'repository', repository: Repository } | { kind: 'label', label: string }

export function groupRepositories(repositories: ReadonlyArray<Repository>): ReadonlyArray<RepositoryListItem> {
  const grouped = new Map<RepositoryGroup, Repository[]>()
  repositories.forEach(repository => {
    const gitHubRepository = repository.gitHubRepository
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

  const flattened = new Array<RepositoryListItem>()

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

    for (const repository of repositories) {
      flattened.push({ kind: 'repository', repository })
    }
  }

  addGroup('github')
  addGroup('enterprise')
  addGroup('other')

  return flattened
}
