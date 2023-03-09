import { IAPIRepository } from '../../lib/api'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { OcticonSymbolType } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { entries, groupBy } from 'lodash'
import { caseInsensitiveEquals, compare } from '../../lib/compare'

/** The identifier for the "Your Repositories" grouping. */
export const YourRepositoriesIdentifier = 'your-repositories'

export interface ICloneableRepositoryListItem extends IFilterListItem {
  /** The identifier for the item. */
  readonly id: string

  /** The search text. */
  readonly text: ReadonlyArray<string>

  /** The name of the repository. */
  readonly name: string

  /** The icon for the repo. */
  readonly icon: OcticonSymbolType

  /** The clone URL. */
  readonly url: string
}

function getIcon(gitHubRepo: IAPIRepository): OcticonSymbolType {
  if (gitHubRepo.private) {
    return OcticonSymbol.lock
  }
  if (gitHubRepo.fork) {
    return OcticonSymbol.repoForked
  }

  return OcticonSymbol.repo
}

const toListItems = (repositories: ReadonlyArray<IAPIRepository>) =>
  repositories
    .map<ICloneableRepositoryListItem>(repo => ({
      id: repo.html_url,
      text: [`${repo.owner.login}/${repo.name}`],
      url: repo.clone_url,
      name: repo.name,
      icon: getIcon(repo),
    }))
    .sort((x, y) => compare(x.name, y.name))

export function groupRepositories(
  repositories: ReadonlyArray<IAPIRepository>,
  login: string
): ReadonlyArray<IFilterListGroup<ICloneableRepositoryListItem>> {
  const groups = groupBy(repositories, x =>
    caseInsensitiveEquals(x.owner.login, login)
      ? YourRepositoriesIdentifier
      : x.owner.login
  )

  return entries(groups)
    .map(([identifier, repos]) => ({ identifier, items: toListItems(repos) }))
    .sort((x, y) => {
      if (x.identifier === YourRepositoriesIdentifier) {
        return -1
      } else if (y.identifier === YourRepositoriesIdentifier) {
        return 1
      } else {
        return compare(x.identifier, y.identifier)
      }
    })
}
