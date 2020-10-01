import { IAPIRepository } from '../../lib/api'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { caseInsensitiveCompare } from '../../lib/compare'
import { OcticonSymbol } from '../octicons'

/** The identifier for the "Your Repositories" grouping. */
export const YourRepositoriesIdentifier = 'your-repositories'

export interface IClonableRepositoryListItem extends IFilterListItem {
  /** The identifier for the item. */
  readonly id: string

  /** The search text. */
  readonly text: ReadonlyArray<string>

  /** The name of the repository. */
  readonly name: string

  /** The icon for the repo. */
  readonly icon: OcticonSymbol

  /** The clone URL. */
  readonly url: string
}

function getIcon(gitHubRepo: IAPIRepository): OcticonSymbol {
  if (gitHubRepo.private) {
    return OcticonSymbol.lock
  }
  if (gitHubRepo.fork) {
    return OcticonSymbol.repoForked
  }

  return OcticonSymbol.repo
}

function convert(
  repositories: ReadonlyArray<IAPIRepository>
): ReadonlyArray<IClonableRepositoryListItem> {
  const repos: ReadonlyArray<IClonableRepositoryListItem> = repositories.map(
    repo => {
      const icon = getIcon(repo)

      return {
        id: repo.html_url,
        text: [`${repo.owner.login}/${repo.name}`],
        url: repo.clone_url,
        name: repo.name,
        icon,
      }
    }
  )

  return repos
}

export function groupRepositories(
  repositories: ReadonlyArray<IAPIRepository>,
  login: string
): ReadonlyArray<IFilterListGroup<IClonableRepositoryListItem>> {
  const userRepos = repositories.filter(repo => repo.owner.type === 'User')
  const orgRepos = repositories.filter(
    repo => repo.owner.type === 'Organization'
  )

  const groups = [
    {
      identifier: YourRepositoriesIdentifier,
      items: convert(userRepos),
    },
  ]

  const orgs = orgRepos.map(repo => repo.owner.login)
  const distinctOrgs = Array.from(new Set(orgs))

  for (const org of distinctOrgs.sort(caseInsensitiveCompare)) {
    const orgRepositories = orgRepos.filter(repo => repo.owner.login === org)

    groups.push({
      identifier: org,
      items: convert(orgRepositories),
    })
  }

  return groups
}
