import * as React from 'react'
import * as Path from 'path'
import { WorktreeEntry } from '../../models/worktree'
import { IMatches } from '../../lib/fuzzy-find'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { HighlightText } from '../lib/highlight-text'
import classNames from 'classnames'
import { TooltippedContent } from '../lib/tooltipped-content'
import { enableAccessibleListToolTips } from '../../lib/feature-flag'

interface IWorktreeListItemProps {
  readonly worktree: WorktreeEntry
  readonly isCurrentWorktree: boolean
  readonly matches: IMatches
}

export class WorktreeListItem extends React.Component<IWorktreeListItemProps> {
  public render() {
    const { worktree, isCurrentWorktree, matches } = this.props
    const name = Path.basename(worktree.path)
    const icon = isCurrentWorktree ? octicons.check : octicons.fileDirectory
    const className = classNames('worktrees-list-item', {
      'current-worktree': isCurrentWorktree,
    })

    return (
      <div className={className}>
        <Octicon className="icon" symbol={icon} />
        <TooltippedContent
          className="name"
          tooltip={name}
          onlyWhenOverflowed={true}
          tagName="div"
          disabled={enableAccessibleListToolTips()}
        >
          <HighlightText text={name} highlight={matches.title} />
        </TooltippedContent>
        {worktree.branch && (
          <TooltippedContent
            className="description"
            tooltip={worktree.branch}
            onlyWhenOverflowed={true}
            tagName="div"
            disabled={enableAccessibleListToolTips()}
          >
            {worktree.branch}
          </TooltippedContent>
        )}
      </div>
    )
  }
}
