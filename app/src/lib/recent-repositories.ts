import {
  getNumber,
  getNumberArray,
  setNumber,
  setNumberArray,
} from './local-storage'

const RecentRepositoriesCountKey = 'recent-repositories-count'
const RecentRepositoriesHistoryKey = 'recent-repositories-history'

export const DefaultRecentRepositoriesCount = 3
export const MaximumRecentRepositoriesCount = 50

function constrainRecentRepositoriesCount(count: number): number {
  if (!Number.isFinite(count)) {
    return DefaultRecentRepositoriesCount
  }

  return Math.max(
    0,
    Math.min(MaximumRecentRepositoriesCount, Math.floor(count))
  )
}

export function getRecentRepositoriesCount(): number {
  return constrainRecentRepositoriesCount(
    getNumber(RecentRepositoriesCountKey, DefaultRecentRepositoriesCount)
  )
}

export function setRecentRepositoriesCount(count: number): void {
  setNumber(RecentRepositoriesCountKey, constrainRecentRepositoriesCount(count))
}

export function mergeRecentRepositories(
  recentRepositories: ReadonlyArray<number>
): ReadonlyArray<number> {
  const storedRepositories = getNumberArray(RecentRepositoriesHistoryKey)
  const repositories = new Array<number>()
  const seen = new Set<number>()

  for (const repositoryId of [...recentRepositories, ...storedRepositories]) {
    if (!seen.has(repositoryId)) {
      seen.add(repositoryId)
      repositories.push(repositoryId)
    }
  }

  const mergedRepositories = repositories.slice(
    0,
    MaximumRecentRepositoriesCount
  )
  setNumberArray(RecentRepositoriesHistoryKey, mergedRepositories)

  return mergedRepositories
}
