import * as React from 'react'

import { Branch } from '../../models/branch'

import { IBranchListItem } from './group-branches'
import { BranchListItem } from './branch-list-item'
import { IMatches } from '../../lib/fuzzy-find'
import { getRelativeTimeInfoFromDate } from '../relative-time'

export function renderDefaultBranch(
  item: IBranchListItem,
  matches: IMatches,
  currentBranch: Branch | null,
  onDropOntoBranch?: (branchName: string) => void,
  onDropOntoCurrentBranch?: () => void
): JSX.Element {
  const branch = item.branch
  const commit = branch.tip
  const currentBranchName = currentBranch ? currentBranch.name : null
  return (
    <BranchListItem
      name={branch.name}
      isCurrentBranch={branch.name === currentBranchName}
      lastCommitDate={commit ? commit.author.date : null}
      matches={matches}
      onDropOntoBranch={onDropOntoBranch}
      onDropOntoCurrentBranch={onDropOntoCurrentBranch}
    />
  )
}

export function getDefaultAriaLabelForBranch(item: IBranchListItem): string {
  const branch = item.branch

  const commit = branch.tip
  const date = commit ? commit.author.date : null

  if (!date) {
    return branch.name
  }

  const { relativeText } = getRelativeTimeInfoFromDate(date, true)
  return `${item.branch.name} ${relativeText}`
}
