import * as Path from 'path'

import {
  Repository,
  ILocalRepositoryState,
  nameOf,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { getHTMLURL } from '../../lib/api'
import { caseInsensitiveCompare, compare } from '../../lib/compare'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IAheadBehind } from '../../models/branch'
import { assertNever } from '../../lib/fatal-error'
import { isDotCom } from '../../lib/endpoint-capabilities'
import { Owner } from '../../models/owner'
import {
  SubmoduleEntry,
  SubmoduleWorkingTreeState,
} from '../../models/submodule'
import {
  EmptyRepositoryFoldersState,
  getRepositoryFolder,
  IRepositoryFoldersState,
} from '../../lib/repository-folders'

export type RepositoryListGroup =
  | {
      kind: 'recent' | 'other'
    }
  | {
      kind: 'dotcom'
      owner: Owner
    }
  | {
      kind: 'enterprise'
      host: string
    }
  | {
      kind: 'submodules'
    }
  | {
      kind: 'folder'
      name: string
    }

/**
 * Returns a unique grouping key (string) for a repository group. Doubles as a
 * case sensitive sorting key (i.e the case sensitive sort order of the keys is
 * the order in which the groups will be displayed in the repository list).
 */
export const getGroupKey = (group: RepositoryListGroup) => {
  const { kind } = group
  switch (kind) {
    case 'recent':
      return `0:recent`
    case 'folder':
      return `1:folder:${group.name.toLowerCase()}:${group.name}`
    case 'dotcom':
      return `2:dotcom:${group.owner.login}`
    case 'enterprise':
      return `3:enterprise:${group.host}`
    case 'other':
      return `4:other`
    case 'submodules':
      return `5:submodules`
    default:
      assertNever(group, `Unknown repository group kind ${kind}`)
  }
}
export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly repository: Repositoryish
  readonly needsDisambiguation: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
  readonly isSubmodule: boolean
  readonly isInRepositoryFolder: boolean
  readonly submodulePath: string | null
  readonly submoduleDisplayName: string | null
  readonly submoduleWorkingTreeState: SubmoduleWorkingTreeState | null
}

const recentRepositoriesThreshold = 7

const getHostForRepository = (repo: RepositoryWithGitHubRepository) =>
  new URL(getHTMLURL(repo.gitHubRepository.endpoint)).host

const getGroupForRepository = (
  repo: Repositoryish,
  isSubmodule: boolean,
  folder: string | null
): RepositoryListGroup => {
  if (folder !== null) {
    return { kind: 'folder', name: folder }
  }

  if (isSubmodule) {
    return { kind: 'submodules' }
  }

  if (repo instanceof Repository && isRepositoryWithGitHubRepository(repo)) {
    return isDotCom(repo.gitHubRepository.endpoint)
      ? { kind: 'dotcom', owner: repo.gitHubRepository.owner }
      : { kind: 'enterprise', host: getHostForRepository(repo) }
  }
  return { kind: 'other' }
}

type RepoGroupItem = { group: RepositoryListGroup; repos: Repositoryish[] }

const getPathKey = (path: string) => {
  const normalizedPath = Path.resolve(path)
  return __WIN32__ ? normalizedPath.toLowerCase() : normalizedPath
}

const isPathWithin = (path: string, parentPath: string) => {
  const relativePath = Path.relative(parentPath, path)
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${Path.sep}`) &&
    !Path.isAbsolute(relativePath)
  )
}

interface ISubmoduleRelationships {
  readonly repositoryIDs: ReadonlySet<number>
  readonly parents: ReadonlyMap<number, Repository>
}

const getSubmoduleRelationships = (
  repositories: ReadonlyArray<Repositoryish>,
  selectedRepository: Repository | null,
  submodules: ReadonlyArray<SubmoduleEntry>
): ISubmoduleRelationships => {
  const localRepositories = repositories.filter(
    (repository): repository is Repository => repository instanceof Repository
  )
  const directSubmoduleParents = new Map<string, Repository>()

  if (selectedRepository !== null) {
    for (const submodule of submodules) {
      directSubmoduleParents.set(
        getPathKey(Path.join(selectedRepository.path, submodule.path)),
        selectedRepository
      )
    }
  }

  const repositoryIDs = new Set<number>()
  const parents = new Map<number, Repository>()

  for (const repository of localRepositories) {
    const directParent = directSubmoduleParents.get(getPathKey(repository.path))

    if (directParent !== undefined && directParent.id !== repository.id) {
      repositoryIDs.add(repository.id)
      parents.set(repository.id, directParent)
      continue
    }

    let parent: Repository | null = null
    let parentModulesPathLength = -1

    for (const possibleParent of localRepositories) {
      if (possibleParent.id === repository.id) {
        continue
      }

      const modulesPath = Path.join(possibleParent.resolvedGitDir, 'modules')
      if (
        isPathWithin(repository.resolvedGitDir, modulesPath) &&
        modulesPath.length > parentModulesPathLength
      ) {
        parent = possibleParent
        parentModulesPathLength = modulesPath.length
      }
    }

    if (parent !== null) {
      repositoryIDs.add(repository.id)
      parents.set(repository.id, parent)
      continue
    }

    const gitDirParts = Path.normalize(repository.resolvedGitDir)
      .split(Path.sep)
      .map(part => part.toLowerCase())
    const usesModulesGitDir = gitDirParts.some(
      (part, index) => part === '.git' && gitDirParts[index + 1] === 'modules'
    )

    if (usesModulesGitDir) {
      repositoryIDs.add(repository.id)
    }
  }

  return { repositoryIDs, parents }
}

const getEffectiveRepositoryFolders = (
  repositories: ReadonlyArray<Repositoryish>,
  repositoryFolders: IRepositoryFoldersState,
  submoduleParents: ReadonlyMap<number, Repository>
) => {
  const effectiveFolders = new Map<number, string | null>()
  const resolving = new Set<number>()

  const resolveFolder = (repository: Repository): string | null => {
    if (effectiveFolders.has(repository.id)) {
      return effectiveFolders.get(repository.id) ?? null
    }

    if (resolving.has(repository.id)) {
      return null
    }

    resolving.add(repository.id)
    const parent = submoduleParents.get(repository.id)
    const folder =
      parent === undefined
        ? getRepositoryFolder(repositoryFolders, repository)
        : resolveFolder(parent)
    resolving.delete(repository.id)
    effectiveFolders.set(repository.id, folder)
    return folder
  }

  for (const repository of repositories) {
    if (repository instanceof Repository) {
      resolveFolder(repository)
    }
  }

  return effectiveFolders
}

export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  recentRepositories: ReadonlyArray<number>,
  selectedRepository: Repository | null = null,
  submodules: ReadonlyArray<SubmoduleEntry> = [],
  repositoryFolders: IRepositoryFoldersState = EmptyRepositoryFoldersState
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  const includeRecentGroup = repositories.length > recentRepositoriesThreshold
  const recentSet = includeRecentGroup ? new Set(recentRepositories) : undefined
  const groups = new Map<string, RepoGroupItem>()
  const submoduleRelationships = getSubmoduleRelationships(
    repositories,
    selectedRepository,
    submodules
  )
  const effectiveFolders = getEffectiveRepositoryFolders(
    repositories,
    repositoryFolders,
    submoduleRelationships.parents
  )

  const addToGroup = (group: RepositoryListGroup, repo: Repositoryish) => {
    const key = getGroupKey(group)
    let rg = groups.get(key)
    if (!rg) {
      rg = { group, repos: [] }
      groups.set(key, rg)
    }

    rg.repos.push(repo)
  }

  for (const folder of repositoryFolders.folders) {
    const group = { kind: 'folder' as const, name: folder }
    groups.set(getGroupKey(group), { group, repos: [] })
  }

  for (const repo of repositories) {
    if (recentSet?.has(repo.id) && repo instanceof Repository) {
      addToGroup({ kind: 'recent' }, repo)
    }

    addToGroup(
      getGroupForRepository(
        repo,
        repo instanceof Repository &&
          submoduleRelationships.repositoryIDs.has(repo.id),
        repo instanceof Repository
          ? effectiveFolders.get(repo.id) ?? null
          : null
      ),
      repo
    )
  }

  const repositoryGroups = Array.from(groups)
    .sort(([xKey], [yKey]) => compare(xKey, yKey))
    .map(([, { group, repos }]) => {
      const isCollapsedFolder =
        group.kind === 'folder' &&
        repositoryFolders.collapsedFolders.includes(group.name)

      return {
        identifier: group,
        showWhenEmpty: group.kind === 'folder',
        items: isCollapsedFolder
          ? []
          : toSortedListItems(
              group,
              repos,
              localRepositoryStateLookup,
              groups,
              submoduleRelationships.repositoryIDs
            ),
      }
    })

  const selectedRepositoryFolder =
    selectedRepository === null
      ? null
      : effectiveFolders.get(selectedRepository.id) ?? null
  const directSubmoduleItems = createDirectSubmoduleListItems(
    repositories,
    selectedRepository,
    submodules,
    selectedRepositoryFolder !== null
  )

  if (directSubmoduleItems.length === 0) {
    return repositoryGroups
  }

  const directSubmoduleGroup: RepositoryListGroup =
    selectedRepositoryFolder === null
      ? { kind: 'submodules' }
      : { kind: 'folder', name: selectedRepositoryFolder }
  const isCollapsedFolder =
    directSubmoduleGroup.kind === 'folder' &&
    repositoryFolders.collapsedFolders.includes(directSubmoduleGroup.name)

  if (isCollapsedFolder) {
    return repositoryGroups
  }

  const existingGroup = repositoryGroups.find(
    group => getGroupKey(group.identifier) === getGroupKey(directSubmoduleGroup)
  )

  if (existingGroup !== undefined) {
    return repositoryGroups.map(group =>
      group === existingGroup
        ? {
            ...group,
            items: sortRepositoryListItems(
              [...group.items, ...directSubmoduleItems],
              directSubmoduleGroup
            ),
          }
        : group
    )
  }

  return [
    ...repositoryGroups,
    {
      identifier: directSubmoduleGroup,
      items: directSubmoduleItems,
    },
  ].sort((x, y) =>
    compare(getGroupKey(x.identifier), getGroupKey(y.identifier))
  )
}

const createDirectSubmoduleListItems = (
  repositories: ReadonlyArray<Repositoryish>,
  selectedRepository: Repository | null,
  submodules: ReadonlyArray<SubmoduleEntry>,
  isInRepositoryFolder: boolean
): ReadonlyArray<IRepositoryListItem> => {
  if (selectedRepository === null || submodules.length === 0) {
    return []
  }

  const registeredPaths = new Set(
    repositories
      .filter(
        (repository): repository is Repository =>
          repository instanceof Repository
      )
      .map(repository => getPathKey(repository.path))
  )

  return submodules
    .map(submodule => ({
      submodule,
      fullPath: Path.resolve(selectedRepository.path, submodule.path),
    }))
    .filter(({ fullPath }) => !registeredPaths.has(getPathKey(fullPath)))
    .map(({ submodule, fullPath }) => ({
      text: [submodule.path, submodule.sha, submodule.describe, 'submodule'],
      id: `submodule:${fullPath}`,
      repository: selectedRepository,
      needsDisambiguation: false,
      aheadBehind: null,
      changedFilesCount: 0,
      isSubmodule: true,
      isInRepositoryFolder,
      submodulePath: fullPath,
      submoduleDisplayName: submodule.path,
      submoduleWorkingTreeState: submodule.workingTreeState,
    }))
    .sort((x, y) =>
      caseInsensitiveCompare(x.submoduleDisplayName, y.submoduleDisplayName)
    )
}

// Returns the display title for a repository, which is either the alias
// (if available) or the name.
const getDisplayTitle = (r: Repositoryish) =>
  r instanceof Repository && r.alias != null ? r.alias : r.name

const sortRepositoryListItems = (
  items: ReadonlyArray<IRepositoryListItem>,
  group: RepositoryListGroup
) =>
  items.slice().sort((x, y) => {
    if (group.kind === 'folder' && x.isSubmodule !== y.isSubmodule) {
      return x.isSubmodule ? 1 : -1
    }

    return caseInsensitiveCompare(x.text[0], y.text[0])
  })

const toSortedListItems = (
  group: RepositoryListGroup,
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  groups: Map<string, RepoGroupItem>,
  submoduleRepositoryIDs: ReadonlySet<number>
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

  return sortRepositoryListItems(
    repositories.map(r => {
      const repoState = localRepositoryStateLookup.get(r.id)
      const title = getDisplayTitle(r)
      const isSubmodule =
        r instanceof Repository && submoduleRepositoryIDs.has(r.id)

      return {
        text:
          r instanceof Repository
            ? [title, nameOf(r), ...(isSubmodule ? ['submodule'] : [])]
            : [title],
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
        isSubmodule,
        isInRepositoryFolder: group.kind === 'folder',
        submodulePath: null,
        submoduleDisplayName: null,
        submoduleWorkingTreeState: null,
      }
    }),
    group
  )
}
