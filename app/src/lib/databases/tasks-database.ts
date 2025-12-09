import Dexie from 'dexie'
import { BaseDatabase } from './base-database'

/** Label information for a task */
export interface ITaskLabel {
  readonly name: string
  readonly color: string
}

/** A task representing a GitHub issue assigned to the user */
export interface ITask {
  /** Local database ID */
  readonly id?: number

  /** GitHub node ID for the issue */
  readonly issueId: string

  /** Issue number */
  readonly issueNumber: number

  /** Issue title */
  readonly title: string

  /** Issue body/description (markdown) */
  readonly body: string | null

  /** Author login name */
  readonly authorLogin: string | null

  /** Author avatar URL */
  readonly authorAvatarUrl: string | null

  /** ISO timestamp of when the issue was created */
  readonly createdAt: string | null

  /** Number of comments on the issue */
  readonly commentCount: number

  /** Local repository database ID */
  readonly repositoryId: number

  /** Repository in owner/repo format */
  readonly repositoryName: string

  /** URL to the issue on GitHub */
  readonly url: string

  /** Issue state */
  readonly state: 'OPEN' | 'CLOSED'

  /** Labels attached to the issue */
  readonly labels: ReadonlyArray<ITaskLabel>

  /** Status from linked project (if any) */
  readonly projectStatus: string | null

  /** Title of the linked project (if any) */
  readonly projectTitle: string | null

  /** Iteration title from linked project (if any) */
  readonly projectIteration: string | null

  /** Iteration start date from linked project (if any) - ISO format */
  readonly projectIterationStartDate: string | null

  // === Local-only fields (not synced to GitHub) ===

  /** Whether this task is pinned to the top of the list */
  readonly isPinned: boolean

  /** Custom sort order for manual ordering */
  readonly localOrder: number

  /** Whether this is the currently active task */
  readonly isActive: boolean

  /** Personal notes about this task */
  readonly notes: string | null

  /** Time spent on this task in minutes */
  readonly timeSpent: number

  /** ISO timestamp of when this task was last worked on */
  readonly lastWorkedOn: string | null

  /** ISO timestamp of when this task was last updated from the API */
  readonly updated_at: string

  /** Source of the task ('repo' for assigned issues, 'project' for project items) */
  readonly source: 'repo' | 'project'
}

/** A saved filter for the task list */
export interface ITaskFilter {
  readonly id?: number
  readonly name: string
  readonly query: string
  readonly isDefault: boolean
}

export class TasksDatabase extends BaseDatabase {
  public declare tasks: Dexie.Table<ITask, number>
  public declare taskFilters: Dexie.Table<ITaskFilter, number>

  public constructor(name: string, schemaVersion?: number) {
    super(name, schemaVersion)

    this.conditionalVersion(1, {
      tasks:
        '++id, issueId, repositoryId, isPinned, isActive, localOrder, [repositoryId+issueNumber]',
      taskFilters: '++id, name, isDefault',
    })
  }

  /** Get all tasks for a specific repository */
  public getTasksForRepository(repositoryId: number) {
    return this.tasks.where('repositoryId').equals(repositoryId).toArray()
  }

  /** Get all tasks across all repositories */
  public getAllTasks() {
    return this.tasks.toArray()
  }

  /** Get all pinned tasks */
  public getPinnedTasks() {
    return this.tasks.filter(task => task.isPinned).toArray()
  }

  /** Get all active tasks (currently being worked on) */
  public getActiveTasks() {
    return this.tasks.filter(task => task.isActive).toArray()
  }

  /** Get a task by its GitHub issue ID */
  public getTaskByIssueId(issueId: string) {
    return this.tasks.where('issueId').equals(issueId).first()
  }

  /** Get all saved task filters */
  public getAllFilters() {
    return this.taskFilters.toArray()
  }

  /** Get the default filter */
  public getDefaultFilter() {
    return this.taskFilters.filter(f => f.isDefault).first()
  }
}
