/* eslint-disable jsx-a11y/no-static-element-interactions */
import classNames from 'classnames'
import { Disposable } from 'event-kit'
import * as React from 'react'
import { dragAndDropManager } from '../../../lib/drag-and-drop-manager'
import { DragData, DragType, DropTargetType } from '../../../models/drag-drop'
import { RowIndexPath } from './list-row-index-path'

export enum InsertionFeedbackType {
  None,
  Top,
  Bottom,
}

interface IListItemInsertionOverlayProps {
  readonly onDropDataInsertion?: (
    insertionIndex: RowIndexPath,
    data: DragData
  ) => void

  readonly itemIndex: RowIndexPath
  readonly dragType: DragType
  readonly forcedFeedbackType: InsertionFeedbackType
  readonly isKeyboardInsertion?: boolean
}

interface IListItemInsertionOverlayState {
  readonly isDragInProgress: boolean
  readonly feedbackType: InsertionFeedbackType
}

/** A component which displays a single commit in a commit list. */
export class ListItemInsertionOverlay extends React.PureComponent<
  IListItemInsertionOverlayProps,
  IListItemInsertionOverlayState
> {
  private onDragStartedDisposable: Disposable | null = null
  private onDragEndedDisposable: Disposable | null = null

  public constructor(props: IListItemInsertionOverlayProps) {
    super(props)

    this.state = {
      isDragInProgress: this.isDragInProgress(),
      feedbackType: InsertionFeedbackType.None,
    }
  }

  public componentDidMount() {
    this.onDragStartedDisposable = dragAndDropManager.onDragStarted(
      this.updateDragInProgressState
    )
    this.onDragEndedDisposable = dragAndDropManager.onDragEnded(dropTarget => {
      this.updateDragInProgressState()
    })
  }

  public componentWillUnmount() {
    if (this.onDragStartedDisposable !== null) {
      this.onDragStartedDisposable.dispose()
      this.onDragStartedDisposable = null
    }

    if (this.onDragEndedDisposable !== null) {
      this.onDragEndedDisposable.dispose()
      this.onDragEndedDisposable = null
    }
  }

  public updateDragInProgressState = () => {
    const isDragInProgress = this.isDragInProgress()
    this.setState({
      isDragInProgress,
      feedbackType: isDragInProgress
        ? this.state.feedbackType
        : InsertionFeedbackType.None,
    })
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
    // Only render top and bottom elements while dragging, otherwise those
    // elements will prevent clicks on them (and therefore starting dragging
    // from them).
    return (
      <div className="list-item-insertion-overlay">
        {this.renderTopElements()}
        {this.props.children}
        {this.renderBottomElements()}
      </div>
    )
  }

  private renderTopElements() {
    if (this.props.isKeyboardInsertion === true) {
      return (
        this.props.forcedFeedbackType === InsertionFeedbackType.Top &&
        this.renderInsertionIndicator(InsertionFeedbackType.Top)
      )
    }

    if (!this.state.isDragInProgress) {
      return null
    }

    return (
      <>
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
      </>
    )
  }

  private renderBottomElements() {
    if (this.props.isKeyboardInsertion === true) {
      return (
        this.props.forcedFeedbackType === InsertionFeedbackType.Bottom &&
        this.renderInsertionIndicator(InsertionFeedbackType.Bottom)
      )
    }

    if (!this.state.isDragInProgress) {
      return null
    }

    return (
      <>
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
      </>
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
      !this.state.isDragInProgress
    ) {
      return
    }

    this.setState({ feedbackType })

    if (feedbackType === InsertionFeedbackType.None) {
      dragAndDropManager.emitLeaveDropTarget()
    } else if (
      this.state.isDragInProgress &&
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
      !this.state.isDragInProgress ||
      this.state.feedbackType === InsertionFeedbackType.None ||
      dragAndDropManager.dragData === null
    ) {
      return
    }

    if (this.props.onDropDataInsertion !== undefined) {
      let index = this.props.itemIndex

      if (this.state.feedbackType === InsertionFeedbackType.Bottom) {
        index = {
          ...index,
          row: index.row + 1,
        }
      }
      this.props.onDropDataInsertion(index, dragAndDropManager.dragData)
    }

    this.switchToInsertionFeedbackType(InsertionFeedbackType.None)
  }
}
