import * as React from 'react'
import classNames from 'classnames'
import { ITask } from '../../lib/databases/tasks-database'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface ITaskItemProps {
  /** The task to display */
  readonly task: ITask

  /** Whether this is the currently active task */
  readonly isActive: boolean

  /** Called when the task is clicked */
  readonly onClick: () => void

  /** Called when the user wants to open the task in browser */
  readonly onOpenInBrowser: () => void
}

/** A single task item in the task list - matches issue list visual style */
export class TaskItem extends React.Component<ITaskItemProps> {
  public render() {
    const { task, isActive } = this.props

    const stateIcon = task.state === 'OPEN' ? octicons.issueOpened : octicons.issueClosed
    const stateClass = task.state === 'OPEN' ? 'open' : 'closed'

    const className = classNames('task-item', stateClass, {
      active: isActive,
      pinned: task.isPinned,
    })

    return (
      <div className={className} onClick={this.props.onClick}>
        <div className="task-item-header">
          <Octicon symbol={stateIcon} className={`task-state-icon ${stateClass}`} />
          <span className="task-number">#{task.issueNumber}</span>
          <span className="task-title">{task.title}</span>
          {task.isPinned && (
            <Octicon symbol={octicons.pin} className="pin-indicator" />
          )}
        </div>

        <div className="task-item-meta">
          {task.labels && task.labels.length > 0 && (
            <div className="task-labels">
              {task.labels.slice(0, 3).map((label, index) => (
                <span
                  key={index}
                  className="task-label"
                  style={{ backgroundColor: `#${label.color}` }}
                >
                  {label.name}
                </span>
              ))}
              {task.labels.length > 3 && (
                <span className="task-label-more">+{task.labels.length - 3}</span>
              )}
            </div>
          )}

          {task.authorAvatarUrl && (
            <div className="task-assignees">
              <img
                src={task.authorAvatarUrl}
                alt={task.authorLogin ?? ''}
                title={task.authorLogin ?? ''}
                className="task-assignee-avatar"
              />
            </div>
          )}

          {task.commentCount > 0 && (
            <span className="task-comments">
              <Octicon symbol={octicons.comment} />
              {task.commentCount}
            </span>
          )}

          {task.projectStatus && (
            <span className="task-project-status" title={task.projectTitle ?? undefined}>
              {task.projectStatus}
            </span>
          )}
        </div>

        <button
          className="task-open-external"
          onClick={this.onOpenInBrowserClick}
          title="Open in browser"
        >
          <Octicon symbol={octicons.linkExternal} />
        </button>
      </div>
    )
  }

  private onOpenInBrowserClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    this.props.onOpenInBrowser()
  }
}
