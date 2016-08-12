import { Branch } from '../../lib/local-git-operations'

export type BranchListItem = { kind: 'branch', branch: Branch } | { kind: 'label', label: string }

export function groupedBranches(defaultBranch: Branch | null, currentBranch: Branch | null, allBranches: ReadonlyArray<Branch>, recentBranches: ReadonlyArray<Branch>): ReadonlyArray<BranchListItem> {
  const items = new Array<BranchListItem>()

  if (defaultBranch) {
    items.push({ kind: 'label', label: 'Default Branch' })
    items.push({ kind: 'branch', branch: defaultBranch })
  }

  items.push({ kind: 'label', label: 'Recent Branches' })
  const recentBranchNames = new Set<string>()
  const defaultBranchName = defaultBranch ? defaultBranch.name : null
  recentBranches.forEach(branch => {
    if (branch.name !== defaultBranchName) {
      items.push({ kind: 'branch', branch: branch })
    }
    recentBranchNames.add(branch.name)
  })

  items.push({ kind: 'label', label: 'Other Branches' })
  allBranches.forEach(branch => {
    if (!recentBranchNames.has(branch.name)) {
      items.push({ kind: 'branch', branch: branch })
    }
  })

  return items
}
