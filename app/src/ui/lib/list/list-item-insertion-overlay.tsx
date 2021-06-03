import classNames from 'classnames'
import * as React from 'react'
import { dragAndDropManager } from '../../../lib/drag-and-drop-manager'
import { DragData, DragType, DropTargetType } from '../../../models/drag-drop'

enum InsertionFeedbackType {
  None,
  Top,
  Bottom,
}

interface IListItemInsertionOverlayProps {
  readonly onDropDataInsertion?: (
    insertionIndex: number,
    data: DragData
  ) => void

  readonly itemIndex: number
  readonly dragType: DragType
}

interface IListItemInsertionOverlayState {
  readonly feedbackType: InsertionFeedbackType
}

/** A component which displays a single commit in a commit list. */
export class ListItemInsertionOverlay extends React.PureComponent<
  IListItemInsertionOverlayProps,
  IListItemInsertionOverlayState
> {
  public constructor(props: IListItemInsertionOverlayProps) {
    super(props)

    this.state = {
      feedbackType: InsertionFeedbackType.None,
    }
  }

  public renderInsertionIndicator(feedbackType: InsertionFeedbackType) {
    const isTop = feedbackType === InsertionFeedbackType.Top

    const classes = classNames('list-item-insertion-indicator', {
      top: isTop,
      bottom: !isTop,
    })

    return (
      <>
        <div className={`${classes} darwin-circle`} />
        <div className={`${classes} darwin-line`} />
      </>
    )
  }

  public render() {
    return (
      <div className="list-item-insertion-overlay">
        <div
          className="list-insertion-point top"
          onMouseEnter={this.getOnInsertionAreaMouseEnter(
            InsertionFeedbackType.Top
          )}
          onMouseLeave={this.onInsertionAreaMouseLeave}
          onMouseUp={this.onInsertionAreaMouseUp}
        />
        {this.state.feedbackType === InsertionFeedbackType.Top &&
          this.renderInsertionIndicator(InsertionFeedbackType.Top)}
        {this.props.children}
        {this.state.feedbackType === InsertionFeedbackType.Bottom &&
          this.renderInsertionIndicator(InsertionFeedbackType.Bottom)}
        <div
          className="list-insertion-point bottom"
          onMouseEnter={this.getOnInsertionAreaMouseEnter(
            InsertionFeedbackType.Bottom
          )}
          onMouseLeave={this.onInsertionAreaMouseLeave}
          onMouseUp={this.onInsertionAreaMouseUp}
        />
      </div>
    )
  }

  private isDragInProgress() {
    return dragAndDropManager.isDragOfTypeInProgress(this.props.dragType)
  }

  private getOnInsertionAreaMouseEnter(feedbackType: InsertionFeedbackType) {
    return (event: React.MouseEvent) => {
      this.switchToInsertionFeedbackType(feedbackType)
    }
  }

  private onInsertionAreaMouseLeave = (event: React.MouseEvent) => {
    this.switchToInsertionFeedbackType(InsertionFeedbackType.None)
  }

  private switchToInsertionFeedbackType(feedbackType: InsertionFeedbackType) {
    if (
      feedbackType !== InsertionFeedbackType.None &&
      !this.isDragInProgress()
    ) {
      return
    }

    this.setState({ feedbackType })

    if (feedbackType === InsertionFeedbackType.None) {
      dragAndDropManager.emitLeaveDropTarget()
    } else if (
      this.isDragInProgress() &&
      dragAndDropManager.dragData !== null
    ) {
      dragAndDropManager.emitEnterDropTarget({
        type: DropTargetType.ListInsertionPoint,
        data: dragAndDropManager.dragData,
        index: this.props.itemIndex,
      })
    }
  }

  private onInsertionAreaMouseUp = () => {
    if (
      !this.isDragInProgress() ||
      this.state.feedbackType === InsertionFeedbackType.None ||
      dragAndDropManager.dragData === null
    ) {
      return
    }

    if (this.props.onDropDataInsertion !== undefined) {
      let index = this.props.itemIndex

      if (this.state.feedbackType === InsertionFeedbackType.Bottom) {
        index++
      }
      this.props.onDropDataInsertion(index, dragAndDropManager.dragData)
    }

    this.switchToInsertionFeedbackType(InsertionFeedbackType.None)
  }
}
