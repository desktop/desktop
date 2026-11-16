import {
  Repository,
  ILocalRepositoryState,
  nameOf,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
  getRepositoryAccountIdentity,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { getHTMLURL } from '../../lib/api'
import { caseInsensitiveCompare, compare } from '../../lib/compare'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IAheadBehind } from '../../models/branch'
import { assertNever } from '../../lib/fatal-error'
import { isDotCom } from '../../lib/endpoint-capabilities'
import { Owner } from '../../models/owner'
import { IAccountIdentity } from '../../models/account'

export type RepositoryListGroup =
  | {
      kind: 'recent'
    }
  | ({
      /** Undefined preserves the old heading; null labels it Unassociated. */
      readonly accountLogin?: string | null
    } & (
      | { kind: 'other' }
      | { kind: 'dotcom'; owner: Owner }
      | { kind: 'enterprise'; host: string }
    ))

const getBaseGroupKey = (group: RepositoryListGroup) => {
  const { kind } = group
  switch (kind) {
    case 'recent':
      return `0:recent`
    case 'dotcom':
      return `1:dotcom:${group.owner.login}`
    case 'enterprise':
      return `2:enterprise:${group.host}`
    case 'other':
      return `3:other`
    default:
      assertNever(group, `Unknown repository group kind ${kind}`)
  }
}

/** Returns a unique grouping key, comparing account logins case-insensitively. */
export const getGroupKey = (group: RepositoryListGroup) => {
  const key = getBaseGroupKey(group)
  return group.kind === 'recent' || group.accountLogin === undefined
    ? key
    : `${key}:${JSON.stringify(group.accountLogin?.toLowerCase() ?? null)}`
}

export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly repository: Repositoryish
  readonly needsDisambiguation: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
}

const recentRepositoriesThreshold = 7

const getHostForRepository = (repo: RepositoryWithGitHubRepository) =>
  new URL(getHTMLURL(repo.gitHubRepository.endpoint)).host

const getGroupForRepository = (
  repo: Repositoryish,
  multiAccountEndpoints: ReadonlySet<string>
): RepositoryListGroup => {
  if (repo instanceof Repository && isRepositoryWithGitHubRepository(repo)) {
    const accountLogin = multiAccountEndpoints.has(
      repo.gitHubRepository.endpoint.toLowerCase()
    )
      ? repo.login
      : undefined
    return isDotCom(repo.gitHubRepository.endpoint)
      ? { kind: 'dotcom', owner: repo.gitHubRepository.owner, accountLogin }
      : { kind: 'enterprise', host: getHostForRepository(repo), accountLogin }
  }
  return {
    kind: 'other',
    accountLogin:
      repo instanceof Repository ? repo.login ?? undefined : undefined,
  }
}

type RepoGroupItem = { group: RepositoryListGroup; repos: Repositoryish[] }

function getMultiAccountEndpoints(
  repositories: ReadonlyArray<Repositoryish>,
  accounts: ReadonlyArray<IAccountIdentity>
): ReadonlySet<string> {
  const loginsByEndpoint = new Map<string, Set<string>>()
  const retain = ({ endpoint, login }: IAccountIdentity) => {
    const key = endpoint.toLowerCase()
    const logins = loginsByEndpoint.get(key) ?? new Set<string>()
    logins.add(login.toLowerCase())
    loginsByEndpoint.set(key, logins)
  }

  accounts.forEach(retain)
  for (const repository of repositories) {
    const identity =
      repository instanceof Repository
        ? getRepositoryAccountIdentity(repository)
        : null
    if (identity !== null) {
      retain(identity)
    }
  }

  return new Set(
    Array.from(loginsByEndpoint)
      .filter(([, logins]) => logins.size > 1)
      .map(([endpoint]) => endpoint)
  )
}

/** Group repositories by owner or host, qualifying groups by account when needed. */
export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  recentRepositories: ReadonlyArray<number>,
  accounts: ReadonlyArray<IAccountIdentity> = []
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  const includeRecentGroup = repositories.length > recentRepositoriesThreshold
  const recentSet = includeRecentGroup ? new Set(recentRepositories) : undefined
  const groups = new Map<string, RepoGroupItem>()
  const multiAccountEndpoints = getMultiAccountEndpoints(repositories, accounts)

  const addToGroup = (group: RepositoryListGroup, repo: Repositoryish) => {
    const key = getGroupKey(group)
    let rg = groups.get(key)
    if (!rg) {
      rg = { group, repos: [] }
      groups.set(key, rg)
    }

    rg.repos.push(repo)
  }

  for (const repo of repositories) {
    if (recentSet?.has(repo.id) && repo instanceof Repository) {
      addToGroup({ kind: 'recent' }, repo)
    }

    addToGroup(getGroupForRepository(repo, multiAccountEndpoints), repo)
  }

  return Array.from(groups)
    .sort(
      ([xKey, x], [yKey, y]) =>
        compare(getBaseGroupKey(x.group), getBaseGroupKey(y.group)) ||
        compare(xKey, yKey)
    )
    .map(([, { group, repos }]) => ({
      identifier: group,
      items: toSortedListItems(
        group,
        repos,
        localRepositoryStateLookup,
        groups
      ),
    }))
}

// Returns the display title for a repository, which is either the alias
// (if available) or the name.
const getDisplayTitle = (r: Repositoryish) =>
  r instanceof Repository && r.alias != null ? r.alias : r.name

const toSortedListItems = (
  group: RepositoryListGroup,
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  groups: Map<string, RepoGroupItem>
): IRepositoryListItem[] => {
  const groupNames = new Map<string, number>()
  const allNames = new Map<string, number>()

  for (const groupItem of groups.values()) {
    // All items in the recent group are by definition present in another
    // group and therefore we don't want to count them.
    if (groupItem.group.kind === 'recent') {
      continue
    }

    for (const title of groupItem.repos.map(getDisplayTitle)) {
      allNames.set(title, (allNames.get(title) ?? 0) + 1)
      if (groupItem.group === group) {
        groupNames.set(title, (groupNames.get(title) ?? 0) + 1)
      }
    }
  }

  return repositories
    .map(r => {
      const repoState = localRepositoryStateLookup.get(r.id)
      const title = getDisplayTitle(r)

      return {
        text: r instanceof Repository ? [title, nameOf(r)] : [title],
        id: r.id.toString(),
        repository: r,
        needsDisambiguation:
          // If the repository is in the enterprise group and has a duplicate
          // name in the group, we need to disambiguate it. We don't have to
          // disambiguate repositories in the 'dotcom' group because they are
          // already grouped by owner. If the repository is in the 'recent'
          // group and has a duplicate name in any group, we need to
          // disambiguate it.
          ((groupNames.get(title) ?? 0) > 1 && group.kind === 'enterprise') ||
          ((allNames.get(title) ?? 0) > 1 && group.kind === 'recent'),
        aheadBehind: repoState?.aheadBehind ?? null,
        changedFilesCount: repoState?.changedFilesCount ?? 0,
      }
    })
    .sort(({ repository: x }, { repository: y }) =>
      caseInsensitiveCompare(getDisplayTitle(x), getDisplayTitle(y))
    )
}
