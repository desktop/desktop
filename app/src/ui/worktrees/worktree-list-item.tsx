import * as React from 'react'
import {
  WorktreeEntry,
  getWorktreeDescription,
  getWorktreeDisplayName,
} from '../../models/worktree'
import { IMatches } from '../../lib/fuzzy-find'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { HighlightText } from '../lib/highlight-text'
import classNames from 'classnames'
import { TooltippedContent } from '../lib/tooltipped-content'
import { enableAccessibleListToolTips } from '../../lib/feature-flag'

/** The worktree's branch name, or its full commit SHA when HEAD is detached. */
function getBranchOrCommit(worktree: WorktreeEntry) {
  return worktree.branch ? getWorktreeDescription(worktree) : worktree.head
}

/**
 * Tooltip content naming a worktree and its full path, so that worktrees
 * sharing a folder name can be told apart. Pass `includeBranch` where the
 * branch's own tooltip isn't available.
 */
export function renderWorktreeTooltip(
  worktree: WorktreeEntry,
  includeBranch = false
) {
  return (
    <div className="list-item-tooltip">
      <div>
        <div className="label">Full Name: </div>
        {getWorktreeDisplayName(worktree)}
      </div>
      <div>
        <div className="label">Path: </div>
        {worktree.path}
      </div>
      {includeBranch && (
        <div>
          <div className="label">
            {worktree.branch ? 'Branch: ' : 'Commit: '}
          </div>
          {getBranchOrCommit(worktree)}
        </div>
      )}
    </div>
  )
}

interface IWorktreeListItemProps {
  readonly worktree: WorktreeEntry
  readonly isCurrentWorktree: boolean
  readonly matches: IMatches
}

export class WorktreeListItem extends React.Component<IWorktreeListItemProps> {
  public render() {
    const { worktree, isCurrentWorktree, matches } = this.props
    const name = getWorktreeDisplayName(worktree)
    const description = getWorktreeDescription(worktree)
    const isMissing = worktree.isPrunable
    const icon = isCurrentWorktree
      ? octicons.check
      : isMissing
      ? octicons.alert
      : octicons.fileDirectory
    const className = classNames('worktrees-list-item', {
      'current-worktree': isCurrentWorktree,
      'missing-worktree': isMissing,
    })

    return (
      <div className={className}>
        <Octicon className="icon" symbol={icon} />
        <TooltippedContent
          className="name"
          tooltip={renderWorktreeTooltip(worktree)}
          tagName="div"
          disabled={enableAccessibleListToolTips()}
        >
          <HighlightText text={name} highlight={matches.title} />
        </TooltippedContent>
        {isMissing && <div className="missing-indicator">(missing)</div>}
        <TooltippedContent
          className="description"
          tooltip={getBranchOrCommit(worktree)}
          onlyWhenOverflowed={true}
          tagName="div"
          disabled={enableAccessibleListToolTips()}
        >
          {description}
        </TooltippedContent>
      </div>
    )
  }
}
