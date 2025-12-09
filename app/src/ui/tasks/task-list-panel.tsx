import * as React from 'react'
import { ITask } from '../../lib/databases/tasks-database'
import { DraggableTaskItem } from './draggable-task-item'
import { TaskViewMode, TaskSource } from '../../lib/stores/tasks-store'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import classNames from 'classnames'

interface ITaskListPanelState {
  /** Whether the panel is in narrow mode (compact layout) */
  readonly isNarrow: boolean
}

interface ITaskListPanelProps {
  /** All tasks to display */
  readonly tasks: ReadonlyArray<ITask>

  /** The currently active task (if any) */
  readonly activeTask: ITask | null

  /** Current view mode */
  readonly viewMode: TaskViewMode

  /** Whether tasks are currently loading from the API */
  readonly isLoading: boolean

  /** Whether the add task button should be enabled */
  readonly canCreateTasks: boolean

  /** Current project filter (null = all projects) */
  readonly projectFilter: string | null

  /** Current status filter (null = all statuses) */
  readonly statusFilter: string | null

  /** Available projects to filter by */
  readonly availableProjects: ReadonlyArray<string>

  /** Available statuses to filter by */
  readonly availableStatuses: ReadonlyArray<string>

  /** Current iteration filter (null = all iterations) */
  readonly iterationFilter: string | null

  /** Available iterations to filter by */
  readonly availableIterations: ReadonlyArray<string>

  /** Called when a task is clicked */
  readonly onTaskClick: (task: ITask) => void

  /** Called when a task's pin status should be toggled */
  readonly onTaskPin: (task: ITask) => void

  /** Called when a task should be activated/deactivated */
  readonly onTaskActivate: (task: ITask) => void

  /** Called when view mode changes */
  readonly onViewModeChange: (mode: TaskViewMode) => void

  /** Called when the refresh button is clicked */
  readonly onRefresh: () => void

  /** Called when a task should be opened in the browser */
  readonly onOpenInBrowser: (task: ITask) => void

  /** Called when the add task button is clicked */
  readonly onAddTask: () => void

  /** Called when tasks are reordered via drag-and-drop */
  readonly onTaskReorder: (sourceTask: ITask, targetIndex: number) => void

  /** Called when project filter changes */
  readonly onProjectFilterChange: (project: string | null) => void

  /** Called when status filter changes */
  readonly onStatusFilterChange: (status: string | null) => void

  /** Called when iteration filter changes */
  readonly onIterationFilterChange: (iteration: string | null) => void

  /** Current task source (repo or project) */
  readonly taskSource: TaskSource

  /** Called when task source changes */
  readonly onTaskSourceChange: (source: TaskSource) => void

  /** Whether a project is selected (enables project source option) */
  readonly hasSelectedProject: boolean

  /** Name of the selected project */
  readonly selectedProjectName: string | null
}

/** Threshold width in pixels below which the panel switches to narrow mode */
const NARROW_THRESHOLD = 280

/** Panel displaying the user's assigned tasks */
export class TaskListPanel extends React.Component<ITaskListPanelProps, ITaskListPanelState> {
  private panelRef = React.createRef<HTMLDivElement>()
  private resizeObserver: ResizeObserver | null = null

  public constructor(props: ITaskListPanelProps) {
    super(props)
    this.state = { isNarrow: false }
  }

  public componentDidMount() {
    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        const isNarrow = width < NARROW_THRESHOLD
        if (isNarrow !== this.state.isNarrow) {
          this.setState({ isNarrow })
        }
      }
    })

    if (this.panelRef.current) {
      this.resizeObserver.observe(this.panelRef.current)
    }
  }

  public componentWillUnmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
  }

  public render() {
    const { tasks, activeTask, viewMode, isLoading } = this.props
    const { isNarrow } = this.state

    const panelClassName = classNames('task-list-panel', {
      narrow: isNarrow,
    })

    return (
      <div ref={this.panelRef} className={panelClassName}>
        <header className="task-list-header">
          <h2>My Tasks</h2>
          <div className="task-list-controls">
            <button
              className="task-refresh-button"
              onClick={this.props.onRefresh}
              disabled={isLoading}
              title="Refresh tasks"
            >
              <Octicon
                symbol={octicons.sync}
                className={classNames({ spinning: isLoading })}
              />
            </button>
            <button
              className="add-task-button"
              onClick={this.props.onAddTask}
              disabled={!this.props.canCreateTasks}
              title="Create new task"
            >
              <Octicon symbol={octicons.plus} />
            </button>
          </div>
        </header>

        {this.renderFilters()}

        {activeTask && (
          <div className="active-task-banner">
            <Octicon symbol={octicons.play} />
            <span className="active-task-label">Working on:</span>
            <strong>#{activeTask.issueNumber}</strong>
            <span className="active-task-title">{activeTask.title}</span>
          </div>
        )}

        <div className="task-list">
          {tasks.length === 0 ? (
            this.renderEmptyState(viewMode, isLoading)
          ) : (
            this.renderTaskList()
          )}
        </div>
      </div>
    )
  }

  private renderTaskList() {
    const { tasks, activeTask } = this.props

    return tasks.map((task, index) => (
      <DraggableTaskItem
        key={task.id}
        task={task}
        index={index}
        isActive={activeTask?.id === task.id}
        isDragEnabled={false}
        onClick={() => this.props.onTaskClick(task)}
        onOpenInBrowser={() => this.props.onOpenInBrowser(task)}
        onDrop={this.props.onTaskReorder}
      />
    ))
  }

  private renderEmptyState(viewMode: TaskViewMode, isLoading: boolean) {
    if (isLoading) {
      return (
        <div className="task-list-empty-state">
          <Octicon symbol={octicons.sync} className="spinning" />
          <p>Loading tasks...</p>
        </div>
      )
    }

    let message = 'No tasks found'
    let hint: string | null = null

    switch (viewMode) {
      case 'pinned':
        hint = 'Pin tasks to see them here'
        break
      case 'active':
        hint = 'Start working on a task to see it here'
        break
      case 'repo':
        hint = 'No tasks assigned to you in this repository'
        break
    }

    return (
      <div className="task-list-empty-state">
        <Octicon symbol={octicons.tasklist} />
        <p>{message}</p>
        {hint && <p className="hint">{hint}</p>}
      </div>
    )
  }

  private renderFilters() {
    const {
      statusFilter,
      iterationFilter,
      availableStatuses,
      availableIterations,
      onStatusFilterChange,
      onIterationFilterChange,
      taskSource,
      onTaskSourceChange,
      hasSelectedProject,
    } = this.props

    return (
      <div className="task-filters">
        {/* Task source dropdown - repo or project */}
        <select
          value={taskSource}
          onChange={e => onTaskSourceChange(e.target.value as TaskSource)}
          className="task-filter-dropdown task-source-dropdown"
          title="Task source"
        >
          <option value="repo">Repo</option>
          <option value="project" disabled={!hasSelectedProject}>
            Project
          </option>
        </select>

        {availableStatuses.length > 0 && (
          <select
            value={statusFilter ?? ''}
            onChange={e =>
              onStatusFilterChange(e.target.value === '' ? null : e.target.value)
            }
            className="task-filter-dropdown"
            title="Filter by status"
          >
            <option value="">All Statuses</option>
            {availableStatuses.map(status => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        )}

        {availableIterations.length > 0 && (
          <select
            value={iterationFilter ?? ''}
            onChange={e =>
              onIterationFilterChange(e.target.value === '' ? null : e.target.value)
            }
            className="task-filter-dropdown"
            title="Filter by iteration"
          >
            <option value="">All Iterations</option>
            {availableIterations.map(iteration => (
              <option key={iteration} value={iteration}>
                {iteration}
              </option>
            ))}
          </select>
        )}
      </div>
    )
  }
}
