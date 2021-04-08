import * as React from 'react'

import { Branch, BranchType } from '../../models/branch'

import { IBranchListItem } from './group-branches'
import { BranchListItem } from './branch-list-item'
import { IMatches } from '../../lib/fuzzy-find'

export function renderDefaultBranch(
  item: IBranchListItem,
  matches: IMatches,
  currentBranch: Branch | null,
  onRenameBranch?: (branchName: string) => void,
  onDeleteBranch?: (branchName: string) => void,
  onDropOntoBranch?: (branchName: string) => void,
  onDropOntoCurrentBranch?: () => void,
  onDragEnterBranch?: (branchName: string) => void,
  onDragLeaveBranch?: () => void,
  isSomethingBeingDragged?: boolean
): JSX.Element {
  const branch = item.branch
  const commit = branch.tip
  const currentBranchName = currentBranch ? currentBranch.name : null
  return (
    <BranchListItem
      name={branch.name}
      isCurrentBranch={branch.name === currentBranchName}
      isLocal={branch.type === BranchType.Local}
      lastCommitDate={commit ? commit.author.date : null}
      matches={matches}
      onRenameBranch={onRenameBranch}
      onDeleteBranch={onDeleteBranch}
      onDropOntoBranch={onDropOntoBranch}
      onDropOntoCurrentBranch={onDropOntoCurrentBranch}
      isSomethingBeingDragged={isSomethingBeingDragged}
      onDragEnterBranch={onDragEnterBranch}
      onDragLeaveBranch={onDragLeaveBranch}
    />
  )
}
