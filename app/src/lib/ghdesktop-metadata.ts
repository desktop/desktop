import * as Path from 'path'
import * as FSE from 'fs-extra'

/**
 * The .ghdesktop folder structure:
 *
 * .ghdesktop/
 *   tasks/
 *     task-lists.md       - Custom task lists/groupings
 *     time-tracking.md    - Time spent per task
 *     notes/
 *       issue-123.md      - Personal notes for issue #123
 *   config.json           - Local preferences (sort order, view mode, etc.)
 */

const GHDESKTOP_DIR = '.ghdesktop'
const TASKS_DIR = 'tasks'
const NOTES_DIR = 'notes'
const CONFIG_FILE = 'config.json'
const TASK_LISTS_FILE = 'task-lists.md'
const TIME_TRACKING_FILE = 'time-tracking.md'

/** Task list definition for custom groupings */
export interface ITaskList {
  name: string
  description?: string
  issueNumbers: number[]
}

/** Time tracking entry for a task */
export interface ITimeEntry {
  issueNumber: number
  date: string
  minutes: number
  note?: string
}

/** Local configuration stored in .ghdesktop */
export interface IGHDesktopConfig {
  sortOrder?: 'priority' | 'updated' | 'custom' | 'repository' | 'iteration'
  viewMode?: 'all' | 'repo' | 'active' | 'pinned'
  pinnedTasks?: number[]
  customTaskOrder?: number[]
}

/**
 * Service for managing the .ghdesktop folder metadata.
 * Stores task-related metadata as markdown/yaml files that can be
 * version controlled and synced between users.
 */
export class GHDesktopMetadataService {
  private repositoryPath: string

  constructor(repositoryPath: string) {
    this.repositoryPath = repositoryPath
  }

  private get ghdesktopPath(): string {
    return Path.join(this.repositoryPath, GHDESKTOP_DIR)
  }

  private get tasksPath(): string {
    return Path.join(this.ghdesktopPath, TASKS_DIR)
  }

  private get notesPath(): string {
    return Path.join(this.tasksPath, NOTES_DIR)
  }

  private get configPath(): string {
    return Path.join(this.ghdesktopPath, CONFIG_FILE)
  }

  private get taskListsPath(): string {
    return Path.join(this.tasksPath, TASK_LISTS_FILE)
  }

  private get timeTrackingPath(): string {
    return Path.join(this.tasksPath, TIME_TRACKING_FILE)
  }

  /**
   * Initialize the .ghdesktop folder structure.
   * Creates necessary directories if they don't exist.
   */
  public async initialize(): Promise<void> {
    await FSE.ensureDir(this.ghdesktopPath)
    await FSE.ensureDir(this.tasksPath)
    await FSE.ensureDir(this.notesPath)

    // Create .gitignore within .ghdesktop if it doesn't exist
    const gitignorePath = Path.join(this.ghdesktopPath, '.gitignore')
    if (!(await FSE.pathExists(gitignorePath))) {
      // By default, don't ignore anything - let users decide what to track
      await FSE.writeFile(
        gitignorePath,
        '# Uncomment to exclude personal files from git\n# notes/\n# config.yml\n'
      )
    }

    // Create README if it doesn't exist
    const readmePath = Path.join(this.ghdesktopPath, 'README.md')
    if (!(await FSE.pathExists(readmePath))) {
      await FSE.writeFile(
        readmePath,
        `# GitHub Desktop Tasks Metadata

This folder contains task management metadata for GitHub Desktop.

## Structure

- \`tasks/task-lists.md\` - Custom task groupings
- \`tasks/time-tracking.md\` - Time spent on tasks
- \`tasks/notes/\` - Personal notes for individual issues
- \`config.yml\` - Local preferences

## Usage

These files can be committed to version control to share task organization
across your team, or added to \`.gitignore\` for personal use only.
`
      )
    }
  }

  /**
   * Check if the .ghdesktop folder exists for this repository.
   */
  public async exists(): Promise<boolean> {
    return FSE.pathExists(this.ghdesktopPath)
  }

  // === Config operations ===

  /**
   * Load the local configuration.
   */
  public async loadConfig(): Promise<IGHDesktopConfig> {
    try {
      if (await FSE.pathExists(this.configPath)) {
        const content = await FSE.readFile(this.configPath, 'utf-8')
        return JSON.parse(content) ?? {}
      }
    } catch (error) {
      log.warn('Failed to load .ghdesktop config', error)
    }
    return {}
  }

  /**
   * Save the local configuration.
   */
  public async saveConfig(config: IGHDesktopConfig): Promise<void> {
    await this.initialize()
    const content = JSON.stringify(config, null, 2)
    await FSE.writeFile(this.configPath, content)
  }

  // === Task Lists operations ===

  /**
   * Load custom task lists.
   */
  public async loadTaskLists(): Promise<ITaskList[]> {
    try {
      if (await FSE.pathExists(this.taskListsPath)) {
        const content = await FSE.readFile(this.taskListsPath, 'utf-8')
        return this.parseTaskListsMarkdown(content)
      }
    } catch (error) {
      log.warn('Failed to load task lists', error)
    }
    return []
  }

  /**
   * Save custom task lists.
   */
  public async saveTaskLists(lists: ITaskList[]): Promise<void> {
    await this.initialize()
    const content = this.formatTaskListsMarkdown(lists)
    await FSE.writeFile(this.taskListsPath, content)
  }

  private parseTaskListsMarkdown(content: string): ITaskList[] {
    const lists: ITaskList[] = []
    const lines = content.split('\n')
    let currentList: ITaskList | null = null

    for (const line of lines) {
      // Match ## List Name
      const headerMatch = line.match(/^## (.+)$/)
      if (headerMatch) {
        if (currentList) {
          lists.push(currentList)
        }
        currentList = { name: headerMatch[1], issueNumbers: [] }
        continue
      }

      // Match description (line after header, before items)
      if (currentList && currentList.issueNumbers.length === 0 && line.trim() && !line.startsWith('-')) {
        currentList.description = line.trim()
        continue
      }

      // Match - #123 or - [ ] #123 (task list item)
      const taskMatch = line.match(/^-\s*(?:\[[x ]\]\s*)?#(\d+)/)
      if (taskMatch && currentList) {
        currentList.issueNumbers.push(parseInt(taskMatch[1], 10))
      }
    }

    if (currentList) {
      lists.push(currentList)
    }

    return lists
  }

  private formatTaskListsMarkdown(lists: ITaskList[]): string {
    const lines = [
      '# Task Lists',
      '',
      'Custom task groupings for project management.',
      '',
    ]

    for (const list of lists) {
      lines.push(`## ${list.name}`)
      if (list.description) {
        lines.push(list.description)
      }
      lines.push('')
      for (const issueNum of list.issueNumbers) {
        lines.push(`- #${issueNum}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  // === Time Tracking operations ===

  /**
   * Load time tracking entries.
   */
  public async loadTimeEntries(): Promise<ITimeEntry[]> {
    try {
      if (await FSE.pathExists(this.timeTrackingPath)) {
        const content = await FSE.readFile(this.timeTrackingPath, 'utf-8')
        return this.parseTimeTrackingMarkdown(content)
      }
    } catch (error) {
      log.warn('Failed to load time tracking', error)
    }
    return []
  }

  /**
   * Add a time entry for a task.
   */
  public async addTimeEntry(entry: ITimeEntry): Promise<void> {
    const entries = await this.loadTimeEntries()
    entries.push(entry)
    await this.saveTimeEntries(entries)
  }

  /**
   * Save all time entries.
   */
  public async saveTimeEntries(entries: ITimeEntry[]): Promise<void> {
    await this.initialize()
    const content = this.formatTimeTrackingMarkdown(entries)
    await FSE.writeFile(this.timeTrackingPath, content)
  }

  private parseTimeTrackingMarkdown(content: string): ITimeEntry[] {
    const entries: ITimeEntry[] = []
    const lines = content.split('\n')

    for (const line of lines) {
      // Match | 2024-01-15 | #123 | 45m | Note |
      const tableMatch = line.match(
        /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*#(\d+)\s*\|\s*(\d+)m\s*\|\s*(.*?)\s*\|$/
      )
      if (tableMatch) {
        entries.push({
          date: tableMatch[1],
          issueNumber: parseInt(tableMatch[2], 10),
          minutes: parseInt(tableMatch[3], 10),
          note: tableMatch[4] || undefined,
        })
      }
    }

    return entries
  }

  private formatTimeTrackingMarkdown(entries: ITimeEntry[]): string {
    const lines = [
      '# Time Tracking',
      '',
      'Time spent on tasks.',
      '',
      '| Date | Issue | Time | Note |',
      '|------|-------|------|------|',
    ]

    for (const entry of entries) {
      lines.push(
        `| ${entry.date} | #${entry.issueNumber} | ${entry.minutes}m | ${entry.note || ''} |`
      )
    }

    return lines.join('\n') + '\n'
  }

  // === Notes operations ===

  /**
   * Load notes for a specific issue.
   */
  public async loadNotes(issueNumber: number): Promise<string | null> {
    const notePath = Path.join(this.notesPath, `issue-${issueNumber}.md`)
    try {
      if (await FSE.pathExists(notePath)) {
        return FSE.readFile(notePath, 'utf-8')
      }
    } catch (error) {
      log.warn(`Failed to load notes for issue #${issueNumber}`, error)
    }
    return null
  }

  /**
   * Save notes for a specific issue.
   */
  public async saveNotes(issueNumber: number, notes: string): Promise<void> {
    await this.initialize()
    const notePath = Path.join(this.notesPath, `issue-${issueNumber}.md`)

    if (!notes.trim()) {
      // Remove empty notes file
      if (await FSE.pathExists(notePath)) {
        await FSE.remove(notePath)
      }
      return
    }

    const content = `# Notes for Issue #${issueNumber}\n\n${notes}`
    await FSE.writeFile(notePath, content)
  }

  /**
   * Get total time spent on an issue.
   */
  public async getTotalTimeForIssue(issueNumber: number): Promise<number> {
    const entries = await this.loadTimeEntries()
    return entries
      .filter(e => e.issueNumber === issueNumber)
      .reduce((sum, e) => sum + e.minutes, 0)
  }
}
