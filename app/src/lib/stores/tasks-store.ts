import {
  TasksDatabase,
  ITask,
  ITaskLabel,
} from '../databases/tasks-database'
import { Account } from '../../models/account'
import { GitHubRepository } from '../../models/github-repository'
import { Emitter, Disposable } from 'event-kit'
import {
  API,
  IAPIIssueWithMetadata,
  IAPIIdentity,
  IAPILabel,
  IAPIMilestone,
  IAPIProjectV2,
  IAPIProjectItem,
  IAPIProjectV2Details,
} from '../api'
import {
  GHDesktopMetadataService,
  ITaskList,
  ITimeEntry,
} from '../ghdesktop-metadata'

/** How tasks are sorted in the list */
export type TaskSortOrder = 'priority' | 'updated' | 'custom' | 'repository' | 'iteration'

/** Which tasks to show */
export type TaskViewMode = 'all' | 'repo' | 'active' | 'pinned'

/** Where to fetch tasks from */
export type TaskSource = 'repo' | 'project'

/** The current state of the tasks store */
export interface ITasksState {
  /** All tasks matching the current view mode */
  readonly tasks: ReadonlyArray<ITask>

  /** The currently active task (if any) */
  readonly activeTask: ITask | null

  /** Current sort order */
  readonly sortOrder: TaskSortOrder

  /** Current view mode */
  readonly viewMode: TaskViewMode

  /** Whether we're currently loading from the API */
  readonly isLoading: boolean

  /** When we last refreshed from the API */
  readonly lastRefresh: Date | null

  /** Collaborators for the current repository */
  readonly collaborators: ReadonlyArray<IAPIIdentity>

  /** Labels for the current repository */
  readonly labels: ReadonlyArray<IAPILabel>

  /** Milestones for the current repository */
  readonly milestones: ReadonlyArray<IAPIMilestone>

  /** Custom task lists from .ghdesktop metadata */
  readonly taskLists: ReadonlyArray<ITaskList>

  /** Time entries from .ghdesktop metadata */
  readonly timeEntries: ReadonlyArray<ITimeEntry>

  /** GitHub Projects V2 linked to the repository */
  readonly projects: ReadonlyArray<IAPIProjectV2>

  /** Filter by project title (null = all projects) */
  readonly projectFilter: string | null

  /** Filter by project status (null = all statuses) */
  readonly statusFilter: string | null

  /** Default project filter (persisted) */
  readonly defaultProject: string | null

  /** Default status filter (persisted) - defaults to 'Todo' */
  readonly defaultStatus: string | null

  /** Available projects to filter by (derived from tasks) */
  readonly availableProjects: ReadonlyArray<string>

  /** Available statuses to filter by (derived from tasks) */
  readonly availableStatuses: ReadonlyArray<string>

  /** Filter by iteration title (null = all iterations) */
  readonly iterationFilter: string | null

  /** Available iterations to filter by (derived from tasks) */
  readonly availableIterations: ReadonlyArray<string>

  // === Issues state (all repository issues) ===

  /** All issues in the repository */
  readonly issues: ReadonlyArray<IAPIIssueWithMetadata>

  /** Whether issues are currently loading */
  readonly isLoadingIssues: boolean

  /** Filter for issue state */
  readonly issueStateFilter: 'open' | 'closed' | 'all'

  /** Where to fetch tasks from (repo assigned issues or project items) */
  readonly taskSource: TaskSource

  /** Current repository ID for filtering repo tasks */
  readonly currentRepositoryId: number | null
}

export { ITaskList, ITimeEntry }
export type { IAPIProjectV2 }

/**
 * The store for managing tasks (GitHub issues assigned to the user).
 * Tasks are synced from GitHub but can have local-only metadata like
 * pinned status, notes, and time tracking.
 */
export class TasksStore {
  private db: TasksDatabase
  private emitter = new Emitter()
  private metadataService: GHDesktopMetadataService | null = null
  private state: ITasksState = {
    tasks: [],
    activeTask: null,
    sortOrder: 'priority',
    viewMode: 'all',
    isLoading: false,
    lastRefresh: null,
    collaborators: [],
    labels: [],
    milestones: [],
    taskLists: [],
    timeEntries: [],
    projects: [],
    projectFilter: null,
    statusFilter: 'Todo', // Default to 'Todo' status
    defaultProject: null,
    defaultStatus: 'Todo',
    availableProjects: [],
    availableStatuses: [],
    iterationFilter: null,
    availableIterations: [],
    issues: [],
    isLoadingIssues: false,
    issueStateFilter: 'open',
    taskSource: 'project', // Default to project items when a project is selected
    currentRepositoryId: null,
  }

  public constructor(db: TasksDatabase) {
    this.db = db
  }

  /**
   * Set the repository path for .ghdesktop metadata operations.
   */
  public setRepositoryPath(path: string): void {
    this.metadataService = new GHDesktopMetadataService(path)
  }

  private emitUpdate() {
    this.emitter.emit('did-update', this.state)
  }

  /** Subscribe to state changes */
  public onDidUpdate(fn: (state: ITasksState) => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /** Get the current state */
  public getState(): ITasksState {
    return this.state
  }

  /**
   * Refresh tasks from GitHub API for all open issues in the repository.
   * If a repository is provided, only fetches tasks for that repo.
   */
  public async refreshTasks(
    account: Account,
    repository?: GitHubRepository
  ): Promise<void> {
    this.state = { ...this.state, isLoading: true }
    this.emitUpdate()

    const api = API.fromAccount(account)

    try {
      let apiIssues: ReadonlyArray<IAPIIssueWithMetadata> = []

      if (repository) {
        // Fetch all open issues for specific repo
        apiIssues = await api.fetchRepoIssues(
          repository.owner.login,
          repository.name
        )
        await this.syncTasks(api, apiIssues, repository)
      }

      this.state = {
        ...this.state,
        isLoading: false,
        lastRefresh: new Date(),
      }
      await this.loadTasks()
    } catch (error) {
      this.state = { ...this.state, isLoading: false }
      this.emitUpdate()
      throw error
    }
  }

  /**
   * Refresh tasks from a GitHub Project's items.
   * This converts project items to tasks and stores them in the database.
   */
  public async refreshTasksFromProject(
    projectDetails: IAPIProjectV2Details
  ): Promise<void> {
    this.state = { ...this.state, isLoading: true }
    this.emitUpdate()

    try {
      await this.syncProjectItems(projectDetails)

      this.state = {
        ...this.state,
        isLoading: false,
        lastRefresh: new Date(),
      }
      await this.loadTasks()
    } catch (error) {
      this.state = { ...this.state, isLoading: false }
      this.emitUpdate()
      throw error
    }
  }

  /**
   * Sync project items with local database as tasks.
   */
  private async syncProjectItems(
    projectDetails: IAPIProjectV2Details
  ): Promise<void> {
    const items = projectDetails.items.filter(
      item => !item.isArchived && item.content?.type === 'Issue'
    )

    // eslint-disable-next-line no-console
    console.log(`[syncProjectItems] Syncing ${items.length} items from project "${projectDetails.title}"`)

    await this.db.transaction('rw', this.db.tasks, async () => {
      const processedIssueIds = new Set<string>()

      for (const item of items) {
        const content = item.content
        if (!content || !content.repository) {
          continue
        }

        // Create a unique issueId using project + content id
        const issueId = `project-${projectDetails.id}-${content.id}`
        processedIssueIds.add(issueId)

        const existing = await this.db.getTaskByIssueId(issueId)

        const labels: ITaskLabel[] = (content.labels ?? []).map(label => ({
          name: label.name,
          color: label.color,
        }))

        // Extract project status and iteration from field values
        let projectStatus: string | null = null
        let projectIteration: string | null = null
        let projectIterationStartDate: string | null = null

        for (const fieldValue of item.fieldValues) {
          if (fieldValue.field?.name === 'Status' && fieldValue.type === 'singleSelect') {
            projectStatus = fieldValue.name ?? null
          }
          if (fieldValue.type === 'iteration') {
            projectIteration = fieldValue.title ?? null
            projectIterationStartDate = fieldValue.startDate ?? null
          }
        }

        const repoName = `${content.repository.owner.login}/${content.repository.name}`

        const taskData: Partial<ITask> = {
          issueId,
          issueNumber: content.number ?? 0,
          title: content.title,
          body: null, // Project items don't include body
          authorLogin: null,
          authorAvatarUrl: content.assignees?.[0]?.avatarUrl ?? null,
          createdAt: null,
          commentCount: 0,
          repositoryId: 0, // No repo ID for project items
          repositoryName: repoName,
          url: content.url ?? '',
          state: content.state === 'CLOSED' ? 'CLOSED' : 'OPEN',
          labels,
          projectStatus,
          projectTitle: projectDetails.title,
          projectIteration,
          projectIterationStartDate,
          updated_at: new Date().toISOString(),
          source: 'project',
        }

        if (existing) {
          // Preserve local-only fields when updating
          await this.db.tasks.update(existing.id!, taskData)
        } else {
          // New task with default local fields
          await this.db.tasks.add({
            ...taskData,
            body: null,
            authorLogin: null,
            authorAvatarUrl: taskData.authorAvatarUrl ?? null,
            createdAt: null,
            commentCount: 0,
            isPinned: false,
            localOrder: 0,
            isActive: false,
            notes: null,
            timeSpent: 0,
            lastWorkedOn: null,
          } as ITask)
        }
      }

      // Remove tasks from this project that are no longer in the project
      const allTasks = await this.db.getAllTasks()
      const projectPrefix = `project-${projectDetails.id}-`

      for (const task of allTasks) {
        if (task.issueId.startsWith(projectPrefix) && !processedIssueIds.has(task.issueId)) {
          await this.db.tasks.delete(task.id!)
        }
      }
    })
  }

  /**
   * Sync API issues with local database, preserving local-only fields.
   */
  private async syncTasks(
    api: API,
    apiIssues: ReadonlyArray<IAPIIssueWithMetadata>,
    repository: GitHubRepository
  ): Promise<void> {
    // Fetch project items for all issues in parallel
    const projectItemsMap = new Map<number, ReadonlyArray<IAPIProjectItem>>()
    await Promise.all(
      apiIssues.map(async issue => {
        const projectItems = await api.fetchIssueProjectItems(
          repository.owner.login,
          repository.name,
          issue.number
        )
        projectItemsMap.set(issue.number, projectItems)
      })
    )

    await this.db.transaction('rw', this.db.tasks, async () => {
      for (const apiIssue of apiIssues) {
        const issueId = `${repository.dbID}-${apiIssue.number}`
        const existing = await this.db.getTaskByIssueId(issueId)

        const labels: ITaskLabel[] = (apiIssue.labels ?? []).map(label => ({
          name: typeof label === 'string' ? label : label.name,
          color: typeof label === 'string' ? '888888' : label.color,
        }))

        // Extract project status from project items
        const projectItems = projectItemsMap.get(apiIssue.number) ?? []
        let projectStatus: string | null = null
        let projectTitle: string | null = null

        // eslint-disable-next-line no-console
        console.log(`[syncTasks] issue #${apiIssue.number} projectItems:`, projectItems)

        let projectIteration: string | null = null
        let projectIterationStartDate: string | null = null

        if (projectItems.length > 0) {
          // Use the first project item's status
          const firstItem = projectItems[0]
          projectTitle = firstItem.project.title

          // Find the Status and Iteration field values
          for (const fieldValue of firstItem.fieldValues) {
            if (fieldValue.field?.name === 'Status' && fieldValue.type === 'singleSelect') {
              projectStatus = fieldValue.name
            }
            if (fieldValue.type === 'iteration') {
              projectIteration = fieldValue.title
              projectIterationStartDate = fieldValue.startDate
            }
          }
        }

        // eslint-disable-next-line no-console
        console.log(`[syncTasks] issue #${apiIssue.number} parsed: projectTitle="${projectTitle}", projectStatus="${projectStatus}", iteration="${projectIteration}"`)

        const taskData: Partial<ITask> = {
          issueId,
          issueNumber: apiIssue.number,
          title: apiIssue.title,
          body: apiIssue.body ?? null,
          authorLogin: apiIssue.user?.login ?? null,
          authorAvatarUrl: apiIssue.user?.avatar_url ?? null,
          createdAt: apiIssue.created_at ?? null,
          commentCount: apiIssue.comments ?? 0,
          repositoryId: repository.dbID,
          repositoryName: `${repository.owner.login}/${repository.name}`,
          url: apiIssue.html_url,
          state: apiIssue.state === 'open' ? 'OPEN' : 'CLOSED',
          labels,
          projectStatus,
          projectTitle,
          projectIteration,
          projectIterationStartDate,
          updated_at: new Date().toISOString(),
          source: 'repo',
        }

        if (existing) {
          // Preserve local-only fields when updating
          await this.db.tasks.update(existing.id!, taskData)
        } else {
          // New task with default local fields
          await this.db.tasks.add({
            ...taskData,
            body: taskData.body ?? null,
            authorLogin: taskData.authorLogin ?? null,
            authorAvatarUrl: taskData.authorAvatarUrl ?? null,
            createdAt: taskData.createdAt ?? null,
            commentCount: taskData.commentCount ?? 0,
            isPinned: false,
            localOrder: 0,
            isActive: false,
            notes: null,
            timeSpent: 0,
            lastWorkedOn: null,
          } as ITask)
        }
      }

      // Remove tasks that are no longer assigned or are closed
      const repoTasks = await this.db.getTasksForRepository(repository.dbID)
      const currentIssueNumbers = new Set(apiIssues.map(i => i.number))

      for (const task of repoTasks) {
        if (!currentIssueNumbers.has(task.issueNumber)) {
          await this.db.tasks.delete(task.id!)
        }
      }
    })
  }

  /**
   * Load tasks from local database based on current view mode.
   */
  public async loadTasks(viewMode?: TaskViewMode): Promise<void> {
    const mode = viewMode ?? this.state.viewMode
    let tasks: ITask[]

    switch (mode) {
      case 'pinned':
        tasks = await this.db.getPinnedTasks()
        break
      case 'active':
        tasks = await this.db.getActiveTasks()
        break
      default:
        tasks = await this.db.getAllTasks()
    }

    // Filter to only open tasks
    tasks = tasks.filter(t => t.state === 'OPEN')

    // Filter by task source (repo or project)
    // Tasks without a source field default to 'repo' for backwards compatibility
    const { taskSource, currentRepositoryId } = this.state
    tasks = tasks.filter(t => (t.source ?? 'repo') === taskSource)

    // When in 'repo' mode, also filter by the current repository
    if (taskSource === 'repo' && currentRepositoryId !== null) {
      tasks = tasks.filter(t => t.repositoryId === currentRepositoryId)
    }

    // Compute available projects, statuses, and iterations from all tasks (before filtering)
    const projectSet = new Set<string>()
    const statusSet = new Set<string>()
    const iterationSet = new Set<string>()
    for (const task of tasks) {
      if (task.projectTitle) {
        projectSet.add(task.projectTitle)
      }
      if (task.projectStatus) {
        statusSet.add(task.projectStatus)
      }
      if (task.projectIteration) {
        iterationSet.add(task.projectIteration)
      }
    }
    const availableProjects = Array.from(projectSet).sort()
    const availableStatuses = Array.from(statusSet).sort()
    const availableIterations = Array.from(iterationSet).sort()

    // Apply project filter
    const { projectFilter, statusFilter, iterationFilter } = this.state
    if (projectFilter) {
      tasks = tasks.filter(t => t.projectTitle === projectFilter)
    }

    // Apply status filter
    if (statusFilter) {
      tasks = tasks.filter(t => t.projectStatus === statusFilter)
    }

    // Apply iteration filter
    if (iterationFilter) {
      tasks = tasks.filter(t => t.projectIteration === iterationFilter)
    }

    // Apply sorting
    tasks = this.sortTasks(tasks)

    // Find active task
    const activeTask = tasks.find(t => t.isActive) ?? null

    this.state = {
      ...this.state,
      tasks,
      viewMode: mode,
      activeTask,
      availableProjects,
      availableStatuses,
      availableIterations,
    }
    this.emitUpdate()
  }

  /**
   * Load tasks for a specific repository.
   */
  public async loadTasksForRepository(repositoryId: number): Promise<void> {
    let tasks = await this.db.getTasksForRepository(repositoryId)
    tasks = tasks.filter(t => t.state === 'OPEN')
    tasks = this.sortTasks(tasks)

    const activeTask = tasks.find(t => t.isActive) ?? null

    this.state = {
      ...this.state,
      tasks,
      viewMode: 'repo',
      activeTask,
    }
    this.emitUpdate()
  }

  private sortTasks(tasks: ITask[]): ITask[] {
    const sorted = [...tasks]

    switch (this.state.sortOrder) {
      case 'priority':
        // Pinned first, then active, then by update time
        return sorted.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
          return (
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )
        })
      case 'custom':
        return sorted.sort((a, b) => a.localOrder - b.localOrder)
      case 'repository':
        return sorted.sort((a, b) =>
          a.repositoryName.localeCompare(b.repositoryName)
        )
      case 'iteration':
        // Sort by iteration start date (earliest first), tasks without iteration at the end
        return sorted.sort((a, b) => {
          // Tasks with iteration come before tasks without
          const aHasIteration = a.projectIterationStartDate !== null
          const bHasIteration = b.projectIterationStartDate !== null
          if (aHasIteration !== bHasIteration) return aHasIteration ? -1 : 1

          // If both have iterations, sort by start date (current/upcoming first)
          if (aHasIteration && bHasIteration) {
            const aDate = new Date(a.projectIterationStartDate!).getTime()
            const bDate = new Date(b.projectIterationStartDate!).getTime()
            if (aDate !== bDate) return aDate - bDate
            // Same iteration, sort by iteration name then by updated time
            const iterCompare = (a.projectIteration || '').localeCompare(b.projectIteration || '')
            if (iterCompare !== 0) return iterCompare
          }

          // Fallback to updated time
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })
      case 'updated':
      default:
        return sorted.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
    }
  }

  // === Local-only operations ===

  /** Pin or unpin a task */
  public async pinTask(taskId: number, pinned: boolean): Promise<void> {
    await this.db.tasks.update(taskId, { isPinned: pinned })
    await this.loadTasks()
  }

  /** Set a task as the active task (only one can be active at a time) */
  public async setActiveTask(taskId: number | null): Promise<void> {
    // Deactivate current active task
    const currentActive = this.state.activeTask
    if (currentActive?.id) {
      await this.db.tasks.update(currentActive.id, { isActive: false })
    }

    // Activate new task
    if (taskId) {
      await this.db.tasks.update(taskId, {
        isActive: true,
        lastWorkedOn: new Date().toISOString(),
      })
    }

    await this.loadTasks()
  }

  /** Update personal notes for a task */
  public async updateTaskNotes(taskId: number, notes: string): Promise<void> {
    await this.db.tasks.update(taskId, { notes: notes || null })
    await this.loadTasks()
  }

  /** Add time spent on a task (in minutes) */
  public async addTimeSpent(taskId: number, minutes: number): Promise<void> {
    const task = await this.db.tasks.get(taskId)
    if (task) {
      await this.db.tasks.update(taskId, {
        timeSpent: task.timeSpent + minutes,
        lastWorkedOn: new Date().toISOString(),
      })
      await this.loadTasks()
    }
  }

  /** Reorder a task (for custom sorting) */
  public async reorderTask(taskId: number, newOrder: number): Promise<void> {
    await this.db.tasks.update(taskId, { localOrder: newOrder })
    this.state = { ...this.state, sortOrder: 'custom' }
    await this.loadTasks()
  }

  /** Change the sort order */
  public async setSortOrder(order: TaskSortOrder): Promise<void> {
    this.state = { ...this.state, sortOrder: order }
    await this.loadTasks()
  }

  /** Change the view mode */
  public async setViewMode(mode: TaskViewMode): Promise<void> {
    await this.loadTasks(mode)
  }

  /** Set project filter */
  public async setProjectFilter(project: string | null): Promise<void> {
    this.state = { ...this.state, projectFilter: project }
    await this.loadTasks()
  }

  /** Set status filter */
  public async setStatusFilter(status: string | null): Promise<void> {
    this.state = { ...this.state, statusFilter: status }
    await this.loadTasks()
  }

  /** Set iteration filter */
  public async setIterationFilter(iteration: string | null): Promise<void> {
    this.state = { ...this.state, iterationFilter: iteration }
    await this.loadTasks()
  }

  /** Set default project (persisted) */
  public setDefaultProject(project: string | null): void {
    this.state = {
      ...this.state,
      defaultProject: project,
      projectFilter: project,
    }
    this.emitUpdate()
  }

  /** Set default status (persisted) */
  public setDefaultStatus(status: string | null): void {
    this.state = {
      ...this.state,
      defaultStatus: status,
      statusFilter: status,
    }
    this.emitUpdate()
  }

  /** Get unique project titles from all tasks */
  public async getAvailableProjects(): Promise<ReadonlyArray<string>> {
    const tasks = await this.db.getAllTasks()
    const projectTitles = new Set<string>()
    for (const task of tasks) {
      if (task.projectTitle) {
        projectTitles.add(task.projectTitle)
      }
    }
    return Array.from(projectTitles).sort()
  }

  /** Get unique status values from all tasks */
  public async getAvailableStatuses(): Promise<ReadonlyArray<string>> {
    const tasks = await this.db.getAllTasks()
    const statuses = new Set<string>()
    for (const task of tasks) {
      if (task.projectStatus) {
        statuses.add(task.projectStatus)
      }
    }
    return Array.from(statuses).sort()
  }

  /** Set collaborators for the current repository */
  public setCollaborators(collaborators: ReadonlyArray<IAPIIdentity>): void {
    this.state = { ...this.state, collaborators }
    this.emitUpdate()
  }

  /** Set labels for the current repository */
  public setLabels(labels: ReadonlyArray<IAPILabel>): void {
    this.state = { ...this.state, labels }
    this.emitUpdate()
  }

  /** Set milestones for the current repository */
  public setMilestones(milestones: ReadonlyArray<IAPIMilestone>): void {
    this.state = { ...this.state, milestones }
    this.emitUpdate()
  }

  /** Set GitHub Projects V2 for the current repository */
  public setProjects(projects: ReadonlyArray<IAPIProjectV2>): void {
    this.state = { ...this.state, projects }
    this.emitUpdate()
  }

  // === .ghdesktop metadata operations ===

  /**
   * Initialize and load .ghdesktop metadata for the current repository.
   */
  public async loadMetadata(): Promise<void> {
    if (!this.metadataService) {
      return
    }

    try {
      const [taskLists, timeEntries, config] = await Promise.all([
        this.metadataService.loadTaskLists(),
        this.metadataService.loadTimeEntries(),
        this.metadataService.loadConfig(),
      ])

      this.state = {
        ...this.state,
        taskLists,
        timeEntries,
        sortOrder: config.sortOrder ?? this.state.sortOrder,
        viewMode: config.viewMode ?? this.state.viewMode,
      }

      // Apply pinned tasks from config
      if (config.pinnedTasks?.length) {
        await this.db.transaction('rw', this.db.tasks, async () => {
          const allTasks = await this.db.getAllTasks()
          for (const task of allTasks) {
            const shouldBePinned = config.pinnedTasks!.includes(task.issueNumber)
            if (task.isPinned !== shouldBePinned) {
              await this.db.tasks.update(task.id!, { isPinned: shouldBePinned })
            }
          }
        })
      }

      // Apply custom order from config
      if (config.customTaskOrder?.length) {
        await this.db.transaction('rw', this.db.tasks, async () => {
          for (let i = 0; i < config.customTaskOrder!.length; i++) {
            const issueNumber = config.customTaskOrder![i]
            const task = await this.db.tasks.where('issueNumber').equals(issueNumber).first()
            if (task) {
              await this.db.tasks.update(task.id!, { localOrder: i })
            }
          }
        })
      }

      await this.loadTasks()
    } catch (error) {
      log.warn('Failed to load .ghdesktop metadata', error)
    }
  }

  /**
   * Save current configuration to .ghdesktop.
   */
  public async saveMetadata(): Promise<void> {
    if (!this.metadataService) {
      return
    }

    try {
      const tasks = await this.db.getAllTasks()
      const pinnedTasks = tasks.filter(t => t.isPinned).map(t => t.issueNumber)
      const customTaskOrder = this.state.sortOrder === 'custom'
        ? [...tasks].sort((a, b) => a.localOrder - b.localOrder).map(t => t.issueNumber)
        : undefined

      await this.metadataService.saveConfig({
        sortOrder: this.state.sortOrder,
        viewMode: this.state.viewMode,
        pinnedTasks,
        customTaskOrder,
      })
    } catch (error) {
      log.warn('Failed to save .ghdesktop metadata', error)
    }
  }

  /**
   * Create a new task list.
   */
  public async createTaskList(name: string, description?: string): Promise<void> {
    if (!this.metadataService) {
      return
    }

    const newList: ITaskList = { name, description, issueNumbers: [] }
    const taskLists = [...this.state.taskLists, newList]
    await this.metadataService.saveTaskLists(taskLists)
    this.state = { ...this.state, taskLists }
    this.emitUpdate()
  }

  /**
   * Add a task to a task list.
   */
  public async addTaskToList(listName: string, issueNumber: number): Promise<void> {
    if (!this.metadataService) {
      return
    }

    const taskLists = this.state.taskLists.map(list => {
      if (list.name === listName && !list.issueNumbers.includes(issueNumber)) {
        return { ...list, issueNumbers: [...list.issueNumbers, issueNumber] }
      }
      return list
    })

    await this.metadataService.saveTaskLists(taskLists)
    this.state = { ...this.state, taskLists }
    this.emitUpdate()
  }

  /**
   * Remove a task from a task list.
   */
  public async removeTaskFromList(listName: string, issueNumber: number): Promise<void> {
    if (!this.metadataService) {
      return
    }

    const taskLists = this.state.taskLists.map(list => {
      if (list.name === listName) {
        return {
          ...list,
          issueNumbers: list.issueNumbers.filter(n => n !== issueNumber),
        }
      }
      return list
    })

    await this.metadataService.saveTaskLists(taskLists)
    this.state = { ...this.state, taskLists }
    this.emitUpdate()
  }

  /**
   * Delete a task list.
   */
  public async deleteTaskList(listName: string): Promise<void> {
    if (!this.metadataService) {
      return
    }

    const taskLists = this.state.taskLists.filter(list => list.name !== listName)
    await this.metadataService.saveTaskLists(taskLists)
    this.state = { ...this.state, taskLists }
    this.emitUpdate()
  }

  /**
   * Log time spent on a task.
   */
  public async logTime(
    issueNumber: number,
    minutes: number,
    note?: string
  ): Promise<void> {
    if (!this.metadataService) {
      return
    }

    const entry: ITimeEntry = {
      issueNumber,
      date: new Date().toISOString().split('T')[0],
      minutes,
      note,
    }

    await this.metadataService.addTimeEntry(entry)
    const timeEntries = [...this.state.timeEntries, entry]
    this.state = { ...this.state, timeEntries }
    this.emitUpdate()
  }

  /**
   * Save notes for a task to .ghdesktop.
   */
  public async saveTaskNotesToMetadata(
    issueNumber: number,
    notes: string
  ): Promise<void> {
    if (!this.metadataService) {
      return
    }

    await this.metadataService.saveNotes(issueNumber, notes)
  }

  /**
   * Load notes for a task from .ghdesktop.
   */
  public async loadTaskNotesFromMetadata(issueNumber: number): Promise<string | null> {
    if (!this.metadataService) {
      return null
    }

    return this.metadataService.loadNotes(issueNumber)
  }

  // === Issues operations ===

  /**
   * Refresh all issues for a repository from the GitHub API.
   */
  public async refreshIssues(
    account: Account,
    repository: GitHubRepository
  ): Promise<void> {
    this.state = { ...this.state, isLoadingIssues: true }
    this.emitUpdate()

    const api = API.fromAccount(account)

    try {
      const issues = await api.fetchIssues(
        repository.owner.login,
        repository.name,
        this.state.issueStateFilter,
        null // since date - fetch all
      )

      // Cast to IAPIIssueWithMetadata since fetchIssues returns full issue data
      this.state = {
        ...this.state,
        issues: issues as ReadonlyArray<IAPIIssueWithMetadata>,
        isLoadingIssues: false,
      }
      this.emitUpdate()
    } catch (error) {
      this.state = { ...this.state, isLoadingIssues: false }
      this.emitUpdate()
      throw error
    }
  }

  /**
   * Set the issue state filter (open, closed, all).
   */
  public setIssueStateFilter(state: 'open' | 'closed' | 'all'): void {
    this.state = { ...this.state, issueStateFilter: state }
    this.emitUpdate()
  }

  /**
   * Set the task source (repo assigned issues or project items).
   */
  public setTaskSource(source: TaskSource): void {
    this.state = { ...this.state, taskSource: source }
    this.emitUpdate()
  }

  /**
   * Set the current repository ID for filtering repo tasks.
   */
  public setCurrentRepository(repositoryId: number | null): void {
    this.state = { ...this.state, currentRepositoryId: repositoryId }
  }

  /**
   * Get the current task source.
   */
  public getTaskSource(): TaskSource {
    return this.state.taskSource
  }

  /**
   * Get the current issues state.
   */
  public getIssues(): ReadonlyArray<IAPIIssueWithMetadata> {
    return this.state.issues
  }
}
