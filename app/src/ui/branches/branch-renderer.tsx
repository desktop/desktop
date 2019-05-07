import * as React from 'react'

import { Branch } from '../../models/branch'

import { IBranchListItem } from './group-branches'
import { BranchListItem } from './branch-list-item'
import { IMatches } from '../../lib/fuzzy-find'

export function renderDefaultBranch(
  item: IBranchListItem,
  matches: IMatches,
  currentBranch: Branch | null
): JSX.Element {
  const branch = item.branch
  const { lastCommitDate } = branch
  const currentBranchName = currentBranch ? currentBranch.name : null
  return (
    <BranchListItem
      name={branch.name}
      isCurrentBranch={branch.name === currentBranchName}
      //lastCommitDate={commit ? commit.author.date : null}
      lastCommitDate={lastCommitDate}
      matches={matches}
    />
  )
}
