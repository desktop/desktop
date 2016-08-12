import { Branch } from '../../lib/local-git-operations'

export type BranchListItem = { kind: 'branch', branch: Branch } | { kind: 'label', label: string }

export function groupedBranches(defaultBranch: Branch | null, currentBranch: Branch | null, allBranches: ReadonlyArray<Branch>, recentBranches: ReadonlyArray<Branch>): ReadonlyArray<BranchListItem> {
  const items = new Array<BranchListItem>()

  if (defaultBranch) {
    items.push({ kind: 'label', label: 'Default Branch' })
    items.push({ kind: 'branch', branch: defaultBranch })
  }

  const recentBranchNames = new Set<string>()
  const defaultBranchName = defaultBranch ? defaultBranch.name : null
  const recentBranchesWithoutDefault = recentBranches.filter(b => b.name !== defaultBranchName)
  if (recentBranchesWithoutDefault.length > 0) {
    items.push({ kind: 'label', label: 'Recent Branches' })
    for (const branch of recentBranchesWithoutDefault) {
      items.push({ kind: 'branch', branch: branch })
      recentBranchNames.add(branch.name)
    }
  }

  const remainingBranches = allBranches.filter(b => b.name !== defaultBranchName && !recentBranchNames.has(b.name))
  if (remainingBranches.length > 0) {
    items.push({ kind: 'label', label: 'Other Branches' })
    for (const branch of remainingBranches) {
      items.push({ kind: 'branch', branch: branch })
    }
  }

  return items
}
