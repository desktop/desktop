import { IAPIRepository } from '../../lib/api'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'

export interface IClonableRepositoryListItem extends IFilterListItem {
  readonly id: string
  readonly text: string
  readonly isPrivate: boolean
  readonly org: string
  readonly name: string
  readonly url: string
}

function convert(
  repositories: ReadonlyArray<IAPIRepository>
): ReadonlyArray<IClonableRepositoryListItem> {
  const repos: ReadonlyArray<
    IClonableRepositoryListItem
  > = repositories.map(repo => {
    return {
      id: repo.html_url,
      text: `${repo.owner.login}/${repo.name}`,
      url: repo.clone_url,
      org: repo.owner.login,
      name: repo.name,
      isPrivate: repo.private,
    }
  })

  return repos
}

export function groupRepositories(
  repositories: ReadonlyArray<IAPIRepository>,
  login: string
): ReadonlyArray<IFilterListGroup<IClonableRepositoryListItem>> {
  const group = [
    {
      identifier: 'all my repos',
      items: convert(repositories),
    },
  ]

  return group
}
