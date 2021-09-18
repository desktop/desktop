import { IAPIRepository, IAPIOrganization } from '../../lib/api'
import { IFilterListCollapsableGroup, IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { caseInsensitiveCompare } from '../../lib/compare'
import { OcticonSymbolType } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

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

function convert(
  repositories: ReadonlyArray<IAPIRepository>
): ReadonlyArray<ICloneableRepositoryListItem> {
  const repos: ReadonlyArray<ICloneableRepositoryListItem> = repositories.map(
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
  organizations: ReadonlyArray<IAPIOrganization>,
  repositories: ReadonlyArray<IAPIRepository>,
  login: string
): ReadonlyArray<IFilterListGroup<ICloneableRepositoryListItem>> {
  const userRepos = repositories.filter(repo => repo.owner.type === 'User')
  const orgRepos = repositories.filter(
    repo => repo.owner.type === 'Organization'
  )

  const groups = [
    {
      identifier: YourRepositoriesIdentifier,
      items: convert(userRepos)
    },
  ]

  const userOrgs = organizations.map(org => org.login)
  const repoOrgs = orgRepos.map(repo => repo.owner.login)
  const distinctOrgs = Array.from(new Set([...userOrgs, ...repoOrgs]))

  for (const org of distinctOrgs.sort(caseInsensitiveCompare)) {
    const orgRepositories = orgRepos.filter(repo => repo.owner.login === org)
    const userOrg = organizations.filter(orgObj => orgObj.login === org)
    
    // Convert organization repositories into repo list
    const repoList = convert(orgRepositories);
    
    // Check if this is an orgnisation from the list or all user orgs, or an extra
    // on that has snuck in from the repo list. In practice this should always be the
    // true. However on the off chance that it isn't, we simply make a non-collapsable
    // group
    if (userOrg.length) {
      
      // Check if we have any repositories for this organization. If so, they must
      // have come from an expanded organization, so create an expanded group. Otherwise
      // the organization was one that the user is a member of, but we haven't loaded 
      // the repositories for it yet, so make as a collapsed group.
      const isExpanded = orgRepositories.length
    
      // Create a collapsable group using the organization URL as the id for our fake
      // list item. Mark also whether the group is collapsed or not.
      const group : IFilterListCollapsableGroup<ICloneableRepositoryListItem> = 
      {
        identifier: org,
        id: userOrg[0].url,
        text: [org],
        items: repoList,
        collapsed: !isExpanded
      }
      
      groups.push(group);
    } else {
      
      // Create a non-collapsable group using just the org name and repo list
      groups.push({
        identifier: org,
        items: repoList
      }) 
    }
  }

  return groups
}
