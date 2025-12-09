import * as React from 'react'
import { Draggable } from '../lib/draggable'
import { ITask } from '../../lib/databases/tasks-database'
import { TaskItem } from './task-item'
import { DropTargetSelector, DragType } from '../../models/drag-drop'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'

interface IDraggableTaskItemProps {
  /** The task to display */
  readonly task: ITask

  /** Whether this is the currently active task */
  readonly isActive: boolean

  /** Index of this task in the list */
  readonly index: number

  /** Whether drag is enabled (typically when sort is 'custom') */
  readonly isDragEnabled: boolean

  /** Called when the task is clicked */
  readonly onClick: () => void

  /** Called when the user wants to open the task in browser */
  readonly onOpenInBrowser: () => void

  /** Called when a task is dropped on this item (for reordering) */
  readonly onDrop: (sourceTask: ITask, targetIndex: number) => void
}

interface IDraggableTaskItemState {
  readonly isDragTarget: boolean
}

/** A draggable task item for reordering in the task list */
export class DraggableTaskItem extends React.Component<
  IDraggableTaskItemProps,
  IDraggableTaskItemState
> {
  public constructor(props: IDraggableTaskItemProps) {
    super(props)
    this.state = { isDragTarget: false }
  }

  public render() {
    const { task, isActive, isDragEnabled } = this.props
    const { isDragTarget } = this.state

    return (
      <div
        className={`draggable-task-wrapper ${isDragTarget ? 'drag-target' : ''}`}
        onDragOver={this.onDragOver}
        onDragLeave={this.onDragLeave}
        onDrop={this.onDropHandler}
        data-task-id={task.id}
      >
        <Draggable
          isEnabled={isDragEnabled}
          onDragStart={this.onDragStart}
          onDragEnd={this.onDragEnd}
          onRenderDragElement={this.onRenderDragElement}
          onRemoveDragElement={this.onRemoveDragElement}
          dropTargetSelectors={[DropTargetSelector.TaskItem]}
        >
          <TaskItem
            task={task}
            isActive={isActive}
            onClick={this.props.onClick}
            onOpenInBrowser={this.props.onOpenInBrowser}
          />
        </Draggable>
      </div>
    )
  }

  private onDragStart = () => {
    const { task } = this.props
    dragAndDropManager.setDragData({
      type: DragType.Task,
      task,
    })
  }

  private onDragEnd = (dropTargetSelector: DropTargetSelector | undefined) => {
    if (dropTargetSelector === DropTargetSelector.TaskItem) {
      // The drop was handled by the drop target
    }
    dragAndDropManager.setDragData(null)
  }

  private onRenderDragElement = () => {
    const { task } = this.props
    const dragElement = document.getElementById('dragElement')
    if (dragElement) {
      dragElement.innerHTML = `
        <div class="task-drag-preview">
          <span class="task-number">#${task.issueNumber}</span>
          <span class="task-title">${task.title}</span>
        </div>
      `
    }
  }

  private onRemoveDragElement = () => {
    const dragElement = document.getElementById('dragElement')
    if (dragElement) {
      dragElement.innerHTML = ''
    }
  }

  private onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    const dragData = dragAndDropManager.dragData
    if (dragData?.type === DragType.Task) {
      this.setState({ isDragTarget: true })
    }
  }

  private onDragLeave = () => {
    this.setState({ isDragTarget: false })
  }

  private onDropHandler = (e: React.DragEvent) => {
    e.preventDefault()
    this.setState({ isDragTarget: false })

    const dragData = dragAndDropManager.dragData
    if (dragData?.type === DragType.Task) {
      this.props.onDrop(dragData.task, this.props.index)
    }
  }
}
