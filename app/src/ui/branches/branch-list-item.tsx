import * as React from 'react'

import { IMatches } from '../../lib/fuzzy-find'

import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { HighlightText } from '../lib/highlight-text'
import { showContextualMenu } from '../../lib/menu-item'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { DragType, DropTargetType } from '../../models/drag-drop'
import { TooltippedContent } from '../lib/tooltipped-content'
import { RelativeTime } from '../relative-time'
import classNames from 'classnames'
import { generateBranchContextMenuItems } from './branch-list-item-context-menu'

interface IBranchListItemProps {
  /** The name of the branch */
  readonly name: string

  /** Specifies whether this item is currently selected */
  readonly isCurrentBranch: boolean

  /** The date may be null if we haven't loaded the tip commit yet. */
  readonly lastCommitDate: Date | null

  /** The characters in the branch name to highlight */
  readonly matches: IMatches

  /** Specifies whether the branch is local */
  readonly isLocal: boolean

  readonly onRenameBranch?: (branchName: string) => void

  readonly onDeleteBranch?: (branchName: string) => void

  /** When a drag element has landed on a branch that is not current */
  readonly onDropOntoBranch?: (branchName: string) => void

  /** When a drag element has landed on the current branch */
  readonly onDropOntoCurrentBranch?: () => void
}

interface IBranchListItemState {
  /**
   * Whether or not there's currently a draggable item being dragged
   * on top of the branch item. We use this in order to disable pointer
   * events when dragging.
   */
  readonly isDragInProgress: boolean
}

/** The branch component. */
export class BranchListItem extends React.Component<
  IBranchListItemProps,
  IBranchListItemState
> {
  public constructor(props: IBranchListItemProps) {
    super(props)
    this.state = { isDragInProgress: false }
  }

  private onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    /*
      There are multiple instances in the application where a branch list item
      is rendered. We only want to be able to rename or delete them on the
      branch dropdown menu. Thus, other places simply will not provide these
      methods, such as the merge and rebase logic.
    */
    const { onRenameBranch, onDeleteBranch, name, isLocal } = this.props
    if (onRenameBranch === undefined && onDeleteBranch === undefined) {
      return
    }

    const items = generateBranchContextMenuItems({
      name,
      isLocal,
      onRenameBranch,
      onDeleteBranch,
    })

    showContextualMenu(items)
  }

  private onMouseEnter = () => {
    if (dragAndDropManager.isDragInProgress) {
      this.setState({ isDragInProgress: true })
    }

    if (dragAndDropManager.isDragOfTypeInProgress(DragType.Commit)) {
      dragAndDropManager.emitEnterDropTarget({
        type: DropTargetType.Branch,
        branchName: this.props.name,
      })
    }
  }

  private onMouseLeave = () => {
    this.setState({ isDragInProgress: false })

    if (dragAndDropManager.isDragOfTypeInProgress(DragType.Commit)) {
      dragAndDropManager.emitLeaveDropTarget()
    }
  }

  private onMouseUp = () => {
    const { onDropOntoBranch, onDropOntoCurrentBranch, name, isCurrentBranch } =
      this.props

    this.setState({ isDragInProgress: false })

    if (!dragAndDropManager.isDragOfTypeInProgress(DragType.Commit)) {
      return
    }

    if (onDropOntoBranch !== undefined && !isCurrentBranch) {
      onDropOntoBranch(name)
    }

    if (onDropOntoCurrentBranch !== undefined && isCurrentBranch) {
      onDropOntoCurrentBranch()
    }
  }

  public render() {
    const { lastCommitDate, isCurrentBranch, name } = this.props
    const icon = isCurrentBranch ? OcticonSymbol.check : OcticonSymbol.gitBranch
    const className = classNames('branches-list-item', {
      'drop-target': this.state.isDragInProgress,
    })

    return (
      <div
        onContextMenu={this.onContextMenu}
        className={className}
        onMouseEnter={this.onMouseEnter}
        onMouseLeave={this.onMouseLeave}
        onMouseUp={this.onMouseUp}
      >
        <Octicon className="icon" symbol={icon} />
        <TooltippedContent
          className="name"
          tooltip={name}
          onlyWhenOverflowed={true}
          tagName="div"
        >
          <HighlightText text={name} highlight={this.props.matches.title} />
        </TooltippedContent>
        {lastCommitDate && (
          <RelativeTime
            className="description"
            date={lastCommitDate}
            onlyRelative={true}
          />
        )}
      </div>
    )
  }
}
