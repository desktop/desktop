import * as React from 'react'

import { IMatches } from '../../lib/fuzzy-find'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { HighlightText } from '../lib/highlight-text'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { DragType, DropTargetType } from '../../models/drag-drop'
import { TooltippedContent } from '../lib/tooltipped-content'
import { RelativeTime } from '../relative-time'
import classNames from 'classnames'

interface IBranchListItemProps {
  /** The name of the branch */
  readonly name: string

  /** Specifies whether this item is currently selected */
  readonly isCurrentBranch: boolean

  /** The date may be null if we haven't loaded the tip commit yet. */
  readonly lastCommitDate: Date | null

  /** The characters in the branch name to highlight */
  readonly matches: IMatches

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
    const icon = isCurrentBranch ? octicons.check : octicons.gitBranch
    const className = classNames('branches-list-item', {
      'drop-target': this.state.isDragInProgress,
    })

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
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
