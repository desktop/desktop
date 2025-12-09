import * as React from 'react'
import { Repository } from '../models/repository'
import { Commit, CommitOneLine } from '../models/commit'
import { TipState } from '../models/tip'
import { UiView } from './ui-view'
import { Changes, ChangesSidebar } from './changes'
import { NoChanges } from './changes/no-changes'
import { MultipleSelection } from './changes/multiple-selection'
import { FilesChangedBadge } from './changes/files-changed-badge'
import { SelectedCommits, CompareSidebar } from './history'
import { Resizable } from './resizable'
import { TabBar } from './tab-bar'
import {
  IRepositoryState,
  RepositorySectionTab,
  ChangesSelectionKind,
  IConstrainedValue,
} from '../lib/app-state'
import { Dispatcher } from './dispatcher'
import { IssuesStore, GitHubUserStore, ITasksState } from '../lib/stores'
import { assertNever } from '../lib/fatal-error'
import { Account } from '../models/account'
import { FocusContainer } from './lib/focus-container'
import { ImageDiffType } from '../models/diff'
import { IMenu } from '../models/app-menu'
import { StashDiffViewer } from './stashing'
import { StashedChangesLoadStates } from '../models/stash-entry'
import { TutorialPanel, TutorialWelcome, TutorialDone } from './tutorial'
import { TutorialStep, isValidTutorialStep } from '../models/tutorial-step'
import { openFile } from './lib/open-file'
import { AheadBehindStore } from '../lib/stores/ahead-behind-store'
import { dragAndDropManager } from '../lib/drag-and-drop-manager'
import { DragType } from '../models/drag-drop'
import { PullRequestSuggestedNextAction } from '../models/pull-request'
import { clamp } from '../lib/clamp'
import { Emoji } from '../lib/emoji'
import { TaskListPanel } from './tasks'
import { IssueDetailView, IIssueInfo } from './tasks/issue-detail-view'
import { IssueListPanel } from './issues'
import { CodeViewSidebar, CodeViewContent, IOpenTab } from './code-view'
import { IAPIIssueWithMetadata } from '../lib/api'
import { shell } from 'electron'
import { isRepositoryWithGitHubRepository } from '../models/repository'
import { ITask } from '../lib/databases/tasks-database'
import { TaskViewMode, TaskSource } from '../lib/stores/tasks-store'
import { IAPIProjectV2 } from '../lib/api'
import { PopupType } from '../models/popup'
import { IEditorSettings } from '../models/preferences'

interface IRepositoryViewProps {
  readonly repository: Repository
  readonly repositories: ReadonlyArray<Repository>
  readonly state: IRepositoryState
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, Emoji>
  readonly sidebarWidth: IConstrainedValue
  readonly commitSummaryWidth: IConstrainedValue
  readonly stashedFilesWidth: IConstrainedValue
  readonly issuesStore: IssuesStore
  readonly gitHubUserStore: GitHubUserStore
  readonly tasksState: ITasksState
  /** The currently selected project (for task source filtering) */
  readonly selectedProject: IAPIProjectV2 | null
  readonly onViewCommitOnGitHub: (SHA: string, filePath?: string) => void
  readonly imageDiffType: ImageDiffType
  readonly hideWhitespaceInChangesDiff: boolean
  readonly hideWhitespaceInHistoryDiff: boolean
  readonly showSideBySideDiff: boolean
  readonly showDiffCheckMarks: boolean
  readonly askForConfirmationOnDiscardChanges: boolean
  readonly askForConfirmationOnCommitFilteredChanges: boolean
  readonly askForConfirmationOnDiscardStash: boolean
  readonly askForConfirmationOnCheckoutCommit: boolean
  readonly focusCommitMessage: boolean
  readonly commitSpellcheckEnabled: boolean
  readonly showCommitLengthWarning: boolean
  readonly accounts: ReadonlyArray<Account>
  readonly shouldShowGenerateCommitMessageCallOut: boolean

  /**
   * A value indicating whether or not the application is currently presenting
   * a modal dialog such as the preferences, or an error dialog
   */
  readonly isShowingModal: boolean

  /**
   * A value indicating whether or not the application is currently presenting
   * a foldout dialog such as the file menu, or the branches dropdown
   */
  readonly isShowingFoldout: boolean

  /**
   * Whether or not the user has a configured (explicitly,
   * or automatically) external editor. Used to
   * determine whether or not to render the action for
   * opening the repository in an external editor.
   */
  readonly isExternalEditorAvailable: boolean

  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  /** A cached entry representing an external editor found on the user's machine */
  readonly resolvedExternalEditor: string | null

  /**
   * Callback to open a selected file using the configured external editor
   *
   * @param fullPath The full path to the file on disk
   */
  readonly onOpenInExternalEditor: (fullPath: string) => void

  /**
   * The top-level application menu item.
   */
  readonly appMenu: IMenu | undefined

  readonly currentTutorialStep: TutorialStep

  readonly onExitTutorial: () => void
  readonly aheadBehindStore: AheadBehindStore
  readonly onCherryPick: (
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ) => void

  /** The user's preference of pull request suggested next action to use **/
  readonly pullRequestSuggestedNextAction?: PullRequestSuggestedNextAction

  /** Whether or not to show the changes filter */
  readonly showChangesFilter: boolean

  /** Editor settings for code editor appearance and behavior */
  readonly editorSettings: IEditorSettings
}

interface IRepositoryViewState {
  readonly changesListScrollTop: number
  readonly compareListScrollTop: number
  /** The currently selected task (for task-specific features like pin/active) */
  readonly selectedTask: ITask | null
  /** The issue info to display in the detail view */
  readonly selectedIssueInfo: IIssueInfo | null
  /** The open tabs in the code view */
  readonly openCodeTabs: ReadonlyArray<IOpenTab>
  /** The currently active tab in the code view */
  readonly activeCodeTab: string | null
  /** Counter for generating unique terminal IDs */
  readonly terminalCounter: number
}

const enum Tab {
  Code = 0,
  Changes = 1,
  History = 2,
  Issues = 3,
  Tasks = 4,
}

export class RepositoryView extends React.Component<
  IRepositoryViewProps,
  IRepositoryViewState
> {
  private previousSection: RepositorySectionTab =
    this.props.state.selectedSection

  // Flag to force the app to use the scroll position in the state the next time
  // the Compare list is rendered.
  private forceCompareListScrollTop: boolean = false

  private readonly changesSidebarRef = React.createRef<ChangesSidebar>()
  private readonly compareSidebarRef = React.createRef<CompareSidebar>()
  private readonly codeViewSidebarRef = React.createRef<CodeViewSidebar>()

  private focusHistoryNeeded: boolean = false
  private focusChangesNeeded: boolean = false

  public constructor(props: IRepositoryViewProps) {
    super(props)

    // Restore code view tabs from localStorage for this repository
    const { openCodeTabs, activeCodeTab } = this.loadTabsForRepository(props.repository.id)

    this.state = {
      changesListScrollTop: 0,
      compareListScrollTop: 0,
      selectedTask: null,
      selectedIssueInfo: null,
      openCodeTabs,
      activeCodeTab,
      terminalCounter: 1,
    }
  }

  private getTabStorageKey(repoId: number): string {
    return `code-view-tabs-${repoId}`
  }

  private loadTabsForRepository(repoId: number): { openCodeTabs: ReadonlyArray<IOpenTab>, activeCodeTab: string | null } {
    let openCodeTabs: ReadonlyArray<IOpenTab> = []
    let activeCodeTab: string | null = null

    try {
      const storageKey = this.getTabStorageKey(repoId)
      const savedData = localStorage.getItem(storageKey)

      if (savedData) {
        const parsed = JSON.parse(savedData)
        openCodeTabs = parsed.tabs || []
        activeCodeTab = parsed.activeTab || null
      }
    } catch (e) {
      log.warn('Failed to restore code view tabs from localStorage', e)
    }

    return { openCodeTabs, activeCodeTab }
  }

  private saveTabsForRepository(repoId: number, tabs: ReadonlyArray<IOpenTab>, activeTab: string | null): void {
    try {
      const storageKey = this.getTabStorageKey(repoId)
      localStorage.setItem(storageKey, JSON.stringify({ tabs, activeTab }))
    } catch (e) {
      log.warn('Failed to persist code view tabs to localStorage', e)
    }
  }

  public setFocusHistoryNeeded(): void {
    this.focusHistoryNeeded = true
  }

  public setFocusChangesNeeded(): void {
    this.focusChangesNeeded = true
  }

  public scrollCompareListToTop(): void {
    this.forceCompareListScrollTop = true

    this.setState({
      compareListScrollTop: 0,
    })
  }

  private onChangesListScrolled = (scrollTop: number) => {
    this.setState({ changesListScrollTop: scrollTop })
  }

  private onCompareListScrolled = (scrollTop: number) => {
    this.setState({ compareListScrollTop: scrollTop })
  }

  private renderChangesBadge(): JSX.Element | null {
    const filesChangedCount =
      this.props.state.changesState.workingDirectory.files.length

    if (filesChangedCount <= 0) {
      return null
    }

    return <FilesChangedBadge filesChangedCount={filesChangedCount} />
  }

  private renderTabs(): JSX.Element {
    const section = this.props.state.selectedSection
    let selectedTab = Tab.Changes
    if (section === RepositorySectionTab.Code) {
      selectedTab = Tab.Code
    } else if (section === RepositorySectionTab.History) {
      selectedTab = Tab.History
    } else if (section === RepositorySectionTab.Tasks) {
      selectedTab = Tab.Tasks
    } else if (section === RepositorySectionTab.Issues) {
      selectedTab = Tab.Issues
    }

    return (
      <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
        <div className="with-indicator" id="code-tab">
          <span>Code</span>
        </div>

        <span className="with-indicator" id="changes-tab">
          <span>Changes</span>
          {this.renderChangesBadge()}
        </span>

        <div className="with-indicator" id="history-tab">
          <span>History</span>
        </div>

        <div className="with-indicator" id="issues-tab">
          <span>Issues</span>
        </div>

        <div className="with-indicator" id="tasks-tab">
          <span>Tasks</span>
        </div>
      </TabBar>
    )
  }

  private renderChangesSidebar(): JSX.Element {
    const tip = this.props.state.branchesState.tip

    let branchName: string | null = null

    if (tip.kind === TipState.Valid) {
      branchName = tip.branch.name
    } else if (tip.kind === TipState.Unborn) {
      branchName = tip.ref
    }

    const localCommitSHAs = this.props.state.localCommitSHAs
    const mostRecentLocalCommitSHA =
      localCommitSHAs.length > 0 ? localCommitSHAs[0] : null
    const mostRecentLocalCommit =
      (mostRecentLocalCommitSHA
        ? this.props.state.commitLookup.get(mostRecentLocalCommitSHA)
        : null) || null

    // -1 Because of right hand side border
    const availableWidth = clamp(this.props.sidebarWidth) - 1

    const scrollTop =
      this.previousSection === RepositorySectionTab.History
        ? this.state.changesListScrollTop
        : undefined
    this.previousSection = RepositorySectionTab.Changes

    return (
      <ChangesSidebar
        ref={this.changesSidebarRef}
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        changes={this.props.state.changesState}
        aheadBehind={this.props.state.aheadBehind}
        branch={branchName}
        commitAuthor={this.props.state.commitAuthor}
        emoji={this.props.emoji}
        mostRecentLocalCommit={mostRecentLocalCommit}
        issuesStore={this.props.issuesStore}
        availableWidth={availableWidth}
        gitHubUserStore={this.props.gitHubUserStore}
        isCommitting={this.props.state.isCommitting}
        isGeneratingCommitMessage={this.props.state.isGeneratingCommitMessage}
        shouldShowGenerateCommitMessageCallOut={
          this.props.shouldShowGenerateCommitMessageCallOut
        }
        commitToAmend={this.props.state.commitToAmend}
        isPushPullFetchInProgress={this.props.state.isPushPullFetchInProgress}
        focusCommitMessage={this.props.focusCommitMessage}
        askForConfirmationOnDiscardChanges={
          this.props.askForConfirmationOnDiscardChanges
        }
        askForConfirmationOnCommitFilteredChanges={
          this.props.askForConfirmationOnCommitFilteredChanges
        }
        accounts={this.props.accounts}
        isShowingModal={this.props.isShowingModal}
        isShowingFoldout={this.props.isShowingFoldout}
        externalEditorLabel={this.props.externalEditorLabel}
        onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        onOpenInCodeTab={this.onOpenFileInCodeTab}
        onChangesListScrolled={this.onChangesListScrolled}
        changesListScrollTop={scrollTop}
        shouldNudgeToCommit={
          this.props.currentTutorialStep === TutorialStep.MakeCommit
        }
        commitSpellcheckEnabled={this.props.commitSpellcheckEnabled}
        showCommitLengthWarning={this.props.showCommitLengthWarning}
        showChangesFilter={this.props.showChangesFilter}
      />
    )
  }

  private renderCompareSidebar(): JSX.Element {
    const { repository, dispatcher, state, aheadBehindStore, emoji } =
      this.props
    const {
      remote,
      compareState,
      branchesState,
      commitSelection: { shas },
      commitLookup,
      localCommitSHAs,
      localTags,
      tagsToPush,
      multiCommitOperationState: mcos,
    } = state
    const { tip } = branchesState
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null
    const scrollTop =
      this.forceCompareListScrollTop ||
      this.previousSection === RepositorySectionTab.Changes
        ? this.state.compareListScrollTop
        : undefined
    this.previousSection = RepositorySectionTab.History
    this.forceCompareListScrollTop = false

    return (
      <CompareSidebar
        ref={this.compareSidebarRef}
        repository={repository}
        isLocalRepository={remote === null}
        compareState={compareState}
        selectedCommitShas={shas}
        shasToHighlight={compareState.shasToHighlight}
        currentBranch={currentBranch}
        emoji={emoji}
        commitLookup={commitLookup}
        localCommitSHAs={localCommitSHAs}
        localTags={localTags}
        dispatcher={dispatcher}
        onRevertCommit={this.onRevertCommit}
        onAmendCommit={this.onAmendCommit}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        onCompareListScrolled={this.onCompareListScrolled}
        onCherryPick={this.props.onCherryPick}
        compareListScrollTop={scrollTop}
        tagsToPush={tagsToPush}
        aheadBehindStore={aheadBehindStore}
        isMultiCommitOperationInProgress={mcos !== null}
        askForConfirmationOnCheckoutCommit={
          this.props.askForConfirmationOnCheckoutCommit
        }
        accounts={this.props.accounts}
      />
    )
  }

  private renderTasksSidebar(): JSX.Element {
    const { tasksState, repository } = this.props
    const canCreateTasks = isRepositoryWithGitHubRepository(repository)

    return (
      <TaskListPanel
        tasks={tasksState.tasks}
        activeTask={tasksState.activeTask}
        viewMode={tasksState.viewMode}
        isLoading={tasksState.isLoading}
        canCreateTasks={canCreateTasks}
        projectFilter={tasksState.projectFilter}
        statusFilter={tasksState.statusFilter}
        iterationFilter={tasksState.iterationFilter}
        availableProjects={tasksState.availableProjects}
        availableStatuses={tasksState.availableStatuses}
        availableIterations={tasksState.availableIterations}
        onTaskClick={this.onTaskClick}
        onTaskPin={this.onTaskPin}
        onTaskActivate={this.onTaskActivate}
        onViewModeChange={this.onTaskViewModeChange}
        onRefresh={this.onTasksRefresh}
        onOpenInBrowser={this.onTaskOpenInBrowser}
        onAddTask={this.onAddTask}
        onTaskReorder={this.onTaskReorder}
        onProjectFilterChange={this.onProjectFilterChange}
        onStatusFilterChange={this.onStatusFilterChange}
        onIterationFilterChange={this.onIterationFilterChange}
        taskSource={tasksState.taskSource}
        onTaskSourceChange={this.onTaskSourceChange}
        hasSelectedProject={this.props.selectedProject !== null}
        selectedProjectName={this.props.selectedProject?.title ?? null}
      />
    )
  }

  private renderIssuesSidebar(): JSX.Element {
    const { tasksState, repository } = this.props
    const canCreateIssues = isRepositoryWithGitHubRepository(repository)

    return (
      <IssueListPanel
        issues={tasksState.issues}
        isLoading={tasksState.isLoadingIssues}
        stateFilter={tasksState.issueStateFilter}
        canCreateIssues={canCreateIssues}
        onRefresh={this.onIssuesRefresh}
        onIssueClick={this.onIssueClick}
        onOpenInBrowser={this.onIssueOpenInBrowser}
        onStateFilterChange={this.onIssueStateFilterChange}
        onAddIssue={this.onAddTask}
      />
    )
  }

  private renderCodeSidebar(): JSX.Element {
    return (
      <CodeViewSidebar
        ref={this.codeViewSidebarRef}
        repositoryPath={this.props.repository.path}
        selectedFile={this.state.activeCodeTab}
        onFileSelected={this.onCodeFileSelected}
        onFileCreated={this.onCodeFileSelected}
        onOpenTerminal={this.onOpenTerminal}
        onOpenClaude={this.onOpenClaude}
      />
    )
  }

  private onCodeFileSelected = (filePath: string) => {
    const { openCodeTabs } = this.state

    // Check if file is already open
    const existingTab = openCodeTabs.find(t => t.filePath === filePath)
    if (existingTab) {
      // Just switch to the existing tab
      this.setState({ activeCodeTab: filePath })
    } else {
      // Add new tab and make it active
      const newTab: IOpenTab = { filePath, hasUnsavedChanges: false }
      this.setState({
        openCodeTabs: [...openCodeTabs, newTab],
        activeCodeTab: filePath,
      })
    }
  }

  /**
   * Opens a file in the Code tab from a relative path (e.g., from the Changes tab)
   */
  private onOpenFileInCodeTab = (relativePath: string) => {
    const Path = require('path')
    const fullPath = Path.join(this.props.repository.path, relativePath)

    // Switch to Code tab
    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      RepositorySectionTab.Code
    )

    // Open the file
    this.onCodeFileSelected(fullPath)
  }

  private onCodeTabSelect = (filePath: string) => {
    this.setState({ activeCodeTab: filePath })
  }

  private onCodeTabClose = (filePath: string) => {
    const { openCodeTabs, activeCodeTab } = this.state
    const newTabs = openCodeTabs.filter(t => t.filePath !== filePath)

    let newActiveTab = activeCodeTab
    if (activeCodeTab === filePath) {
      // If closing the active tab, switch to the last tab or null
      newActiveTab = newTabs.length > 0 ? newTabs[newTabs.length - 1].filePath : null
    }

    this.setState({
      openCodeTabs: newTabs,
      activeCodeTab: newActiveTab,
    })
  }

  private onCodeTabUnsavedChange = (filePath: string, hasUnsavedChanges: boolean) => {
    const { openCodeTabs } = this.state
    const newTabs = openCodeTabs.map(t =>
      t.filePath === filePath ? { ...t, hasUnsavedChanges } : t
    )
    this.setState({ openCodeTabs: newTabs })
  }

  private onOpenTerminal = async () => {
    const repositoryPath = this.props.repository.path
    const { spawn } = require('child_process')
    const platform = process.platform

    if (platform === 'darwin') {
      // macOS: Use AppleScript to open Terminal.app
      const script = `
        tell application "Terminal"
          activate
          do script "cd '${repositoryPath.replace(/'/g, "'\\''")}'"
        end tell
      `
      spawn('osascript', ['-e', script])
    } else if (platform === 'linux') {
      // Linux: Try common terminal emulators in order of preference
      const terminals = [
        { cmd: 'gnome-terminal', args: ['--working-directory', repositoryPath] },
        { cmd: 'konsole', args: ['--workdir', repositoryPath] },
        { cmd: 'xfce4-terminal', args: ['--working-directory', repositoryPath] },
        { cmd: 'xterm', args: ['-e', `cd "${repositoryPath}" && $SHELL`] },
        { cmd: 'x-terminal-emulator', args: ['-e', `cd "${repositoryPath}" && $SHELL`] },
      ]

      // Try each terminal until one works
      const tryTerminal = (index: number) => {
        if (index >= terminals.length) {
          log.error('No terminal emulator found')
          return
        }
        const { cmd, args } = terminals[index]
        const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
        child.on('error', () => tryTerminal(index + 1))
        child.unref()
      }
      tryTerminal(0)
    } else if (platform === 'win32') {
      // Windows: Use cmd.exe or PowerShell
      spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', `cd /d "${repositoryPath}"`], {
        detached: true,
        stdio: 'ignore',
      })
    }
  }

  private onTerminalExit = (terminalTabPath: string) => {
    // Don't auto-close - let user see the terminal exited
    console.log('Terminal exited:', terminalTabPath)
    // Optionally close after a delay or leave it for user to close manually
    // this.onCodeTabClose(terminalTabPath)
  }

  private onOpenClaude = async () => {
    const repositoryPath = this.props.repository.path
    const { spawn } = require('child_process')
    const platform = process.platform

    // Command with fallback: try 'claude' first, then 'npx @anthropic-ai/claude-code'
    const claudeCommand = `claude || npx @anthropic-ai/claude-code`

    if (platform === 'darwin') {
      // macOS: Use AppleScript to open Terminal.app in the repository directory
      // First cd to the repo, then run claude in the same window
      // This ensures the terminal's cwd is set before claude starts
      const escapedPath = repositoryPath.replace(/'/g, "'\\''")
      const script = `
        tell application "Terminal"
          activate
          set newWindow to do script "cd '${escapedPath}'"
          delay 0.3
          do script "claude || npx @anthropic-ai/claude-code" in newWindow
        end tell
      `
      spawn('osascript', ['-e', script])
    } else if (platform === 'linux') {
      // Linux: Try common terminal emulators with claude command
      const terminals = [
        { cmd: 'gnome-terminal', args: ['--working-directory', repositoryPath, '--', 'bash', '-c', `${claudeCommand}; exec bash`] },
        { cmd: 'konsole', args: ['--workdir', repositoryPath, '-e', 'bash', '-c', `${claudeCommand}; exec bash`] },
        { cmd: 'xfce4-terminal', args: ['--working-directory', repositoryPath, '-e', `bash -c "${claudeCommand}; exec bash"`] },
        { cmd: 'xterm', args: ['-e', `cd "${repositoryPath}" && ${claudeCommand}; exec bash`] },
      ]

      const tryTerminal = (index: number) => {
        if (index >= terminals.length) {
          log.error('No terminal emulator found for Claude')
          return
        }
        const { cmd, args } = terminals[index]
        const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
        child.on('error', () => tryTerminal(index + 1))
        child.unref()
      }
      tryTerminal(0)
    } else if (platform === 'win32') {
      // Windows: Use cmd.exe to run claude with fallback
      spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', `cd /d "${repositoryPath}" && (${claudeCommand})`], {
        detached: true,
        stdio: 'ignore',
      })
    }
  }

  private onIssuesRefresh = () => {
    const { repository } = this.props
    if (isRepositoryWithGitHubRepository(repository)) {
      this.props.dispatcher.refreshRepositoryIssues(repository)
    }
  }

  private onIssueClick = (issue: IAPIIssueWithMetadata) => {
    const { repository } = this.props

    // Convert API issue to IIssueInfo for the detail view
    const issueInfo: IIssueInfo = {
      issueId: issue.node_id,
      issueNumber: issue.number,
      title: issue.title,
      body: issue.body,
      authorLogin: issue.user?.login || null,
      authorAvatarUrl: issue.user?.avatar_url || null,
      createdAt: issue.created_at || null,
      repositoryName: isRepositoryWithGitHubRepository(repository)
        ? `${repository.gitHubRepository.owner.login}/${repository.gitHubRepository.name}`
        : repository.name,
      url: issue.html_url,
      state: issue.state === 'open' ? 'OPEN' : 'CLOSED',
      labels: issue.labels?.map(l => ({
        name: typeof l === 'string' ? l : l.name || '',
        color: typeof l === 'string' ? '000000' : l.color || '000000',
      })) || [],
      projectStatus: null,
      projectTitle: null,
    }

    // Show the issue detail view (no selectedTask since not from Tasks tab)
    this.setState({ selectedTask: null, selectedIssueInfo: issueInfo })
  }

  private onIssueOpenInBrowser = (issue: IAPIIssueWithMetadata) => {
    shell.openExternal(issue.html_url)
  }

  private onIssueStateFilterChange = (state: 'open' | 'closed' | 'all') => {
    this.props.dispatcher.setIssueStateFilter(state)
    // Re-fetch with new filter
    const { repository } = this.props
    if (isRepositoryWithGitHubRepository(repository)) {
      this.props.dispatcher.refreshRepositoryIssues(repository)
    }
  }

  private onTaskDetailBack = () => {
    this.setState({ selectedTask: null, selectedIssueInfo: null })
  }

  private onAddTask = () => {
    const { repository } = this.props
    if (isRepositoryWithGitHubRepository(repository)) {
      this.props.dispatcher.showPopup({
        type: PopupType.CreateTask,
        repository,
      })
    }
  }

  private onTaskClick = (task: ITask) => {
    // Convert ITask to IIssueInfo for the detail view
    const issueInfo: IIssueInfo = {
      issueId: task.issueId,
      issueNumber: task.issueNumber,
      title: task.title,
      body: task.body,
      authorLogin: task.authorLogin,
      authorAvatarUrl: task.authorAvatarUrl,
      createdAt: task.createdAt,
      repositoryName: task.repositoryName,
      url: task.url,
      state: task.state,
      labels: [...task.labels],
      projectStatus: task.projectStatus,
      projectTitle: task.projectTitle,
    }
    // Show the task detail view
    this.setState({ selectedTask: task, selectedIssueInfo: issueInfo })
  }

  private onTaskPin = (task: ITask) => {
    if (task.id) {
      this.props.dispatcher.pinTask(task.id, !task.isPinned)
    }
  }

  private onTaskActivate = (task: ITask) => {
    if (task.id) {
      const newActiveId = task.isActive ? null : task.id
      this.props.dispatcher.setActiveTask(newActiveId)
    }
  }

  private onTaskViewModeChange = (mode: TaskViewMode) => {
    this.props.dispatcher.setTaskViewMode(mode)
  }

  private onTasksRefresh = () => {
    const { repository } = this.props
    if (isRepositoryWithGitHubRepository(repository)) {
      this.props.dispatcher.refreshTasks(repository)
      // Also fetch projects for the project status dropdown
      this.props.dispatcher.fetchProjects(repository)
    }
  }

  private onTaskOpenInBrowser = (task: ITask) => {
    this.props.dispatcher.openTaskInBrowser(task)
  }

  private onTaskReorder = (sourceTask: ITask, targetIndex: number) => {
    if (sourceTask.id) {
      this.props.dispatcher.reorderTask(sourceTask.id, targetIndex)
    }
  }

  private onProjectFilterChange = (project: string | null) => {
    this.props.dispatcher.setTaskProjectFilter(project)
  }

  private onStatusFilterChange = (status: string | null) => {
    this.props.dispatcher.setTaskStatusFilter(status)
  }

  private onIterationFilterChange = (iteration: string | null) => {
    this.props.dispatcher.setTaskIterationFilter(iteration)
  }

  private onTaskSourceChange = (source: TaskSource) => {
    if (isRepositoryWithGitHubRepository(this.props.repository)) {
      this.props.dispatcher.setTaskSource(source, this.props.repository)
    }
  }

  private renderSidebarContents(): JSX.Element {
    const selectedSection = this.props.state.selectedSection

    if (selectedSection === RepositorySectionTab.Code) {
      return this.renderCodeSidebar()
    } else if (selectedSection === RepositorySectionTab.Changes) {
      return this.renderChangesSidebar()
    } else if (selectedSection === RepositorySectionTab.History) {
      return this.renderCompareSidebar()
    } else if (selectedSection === RepositorySectionTab.Tasks) {
      return this.renderTasksSidebar()
    } else if (selectedSection === RepositorySectionTab.Issues) {
      return this.renderIssuesSidebar()
    } else {
      return assertNever(selectedSection, 'Unknown repository section')
    }
  }

  private handleSidebarWidthReset = () => {
    this.props.dispatcher.resetSidebarWidth()
  }

  private handleSidebarResize = (width: number) => {
    this.props.dispatcher.setSidebarWidth(width)
  }

  private renderSidebar(): JSX.Element {
    return (
      <FocusContainer onFocusWithinChanged={this.onSidebarFocusWithinChanged}>
        <Resizable
          id="repository-sidebar"
          width={this.props.sidebarWidth.value}
          maximumWidth={this.props.sidebarWidth.max}
          minimumWidth={this.props.sidebarWidth.min}
          onReset={this.handleSidebarWidthReset}
          onResize={this.handleSidebarResize}
          description="Repository sidebar"
        >
          {this.renderTabs()}
          {this.renderSidebarContents()}
        </Resizable>
      </FocusContainer>
    )
  }

  private onSidebarFocusWithinChanged = (sidebarHasFocusWithin: boolean) => {
    if (
      sidebarHasFocusWithin === false &&
      this.props.state.selectedSection === RepositorySectionTab.History
    ) {
      this.props.dispatcher.updateCompareForm(this.props.repository, {
        showBranchList: false,
      })
    }
  }

  private renderStashedChangesContent(): JSX.Element | null {
    const { changesState } = this.props.state
    const { selection, stashEntry } = changesState

    if (selection.kind !== ChangesSelectionKind.Stash || stashEntry === null) {
      return null
    }

    if (stashEntry.files.kind === StashedChangesLoadStates.Loaded) {
      return (
        <StashDiffViewer
          stashEntry={stashEntry}
          selectedStashedFile={selection.selectedStashedFile}
          stashedFileDiff={selection.selectedStashedFileDiff}
          imageDiffType={this.props.imageDiffType}
          fileListWidth={this.props.stashedFilesWidth}
          repository={this.props.repository}
          dispatcher={this.props.dispatcher}
          askForConfirmationOnDiscardStash={
            this.props.askForConfirmationOnDiscardStash
          }
          showSideBySideDiff={this.props.showSideBySideDiff}
          onOpenBinaryFile={this.onOpenBinaryFile}
          onOpenSubmodule={this.onOpenSubmodule}
          onChangeImageDiffType={this.onChangeImageDiffType}
          onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged}
          onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        />
      )
    }

    return null
  }

  private onHideWhitespaceInDiffChanged = (hideWhitespaceInDiff: boolean) => {
    return this.props.dispatcher.onHideWhitespaceInChangesDiffChanged(
      hideWhitespaceInDiff,
      this.props.repository
    )
  }

  private renderContentForCode(): JSX.Element {
    return (
      <CodeViewContent
        openTabs={this.state.openCodeTabs}
        activeTab={this.state.activeCodeTab}
        repositoryPath={this.props.repository.path}
        repositoryName={this.props.repository.name}
        emoji={this.props.emoji}
        onTabSelect={this.onCodeTabSelect}
        onTabClose={this.onCodeTabClose}
        onTabUnsavedChange={this.onCodeTabUnsavedChange}
        onTerminalExit={this.onTerminalExit}
        onWikiLinkClick={this.onWikiLinkClick}
        editorSettings={this.props.editorSettings}
      />
    )
  }

  private onWikiLinkClick = async (repoName: string | null, filePath: string) => {
    if (!repoName) {
      // Same repo, just open the file
      const fullPath = require('path').join(this.props.repository.path, filePath)
      this.onCodeTabSelect(fullPath)
      return
    }

    // Cross-repo link - find the repository and switch to it
    const { repositories, dispatcher } = this.props

    // Find the repository by name (case-insensitive)
    const targetRepo = repositories.find(
      r => r.name.toLowerCase() === repoName.toLowerCase()
    )

    if (!targetRepo) {
      // Repository not found
      dispatcher.showPopup({
        type: PopupType.Error,
        error: new Error(`Repository "${repoName}" not found.\n\nMake sure the repository is added to GitHub Desktop.`),
      })
      return
    }

    // Store the file to open BEFORE switching repos
    // so componentDidUpdate can pick it up after the switch
    const fullPath = require('path').join(targetRepo.path, filePath)
    localStorage.setItem('pending-wiki-link-file', fullPath)

    // Switch to the target repository
    await dispatcher.selectRepository(targetRepo)
  }

  private renderContentForTasks(): JSX.Element | null {
    const { selectedTask, selectedIssueInfo } = this.state
    const { repository, accounts, tasksState } = this.props

    if (!selectedIssueInfo) {
      // Show empty state when no task is selected
      return (
        <div className="task-content-empty">
          <div className="empty-state">
            <p>Select a task from the list to view details</p>
          </div>
        </div>
      )
    }

    // Get account and repo info for the API
    if (!isRepositoryWithGitHubRepository(repository)) {
      return null
    }

    const account = accounts.find(
      a => a.endpoint === repository.gitHubRepository.endpoint
    )
    if (!account) {
      return null
    }

    const owner = repository.gitHubRepository.owner.login
    const repo = repository.gitHubRepository.name
    const isActive = selectedTask ? tasksState.activeTask?.id === selectedTask.id : false

    return (
      <IssueDetailView
        owner={owner}
        repo={repo}
        issue={selectedIssueInfo}
        account={account}
        projects={tasksState.projects}
        onBack={this.onTaskDetailBack}
        onOpenInBrowser={() => shell.openExternal(selectedIssueInfo.url)}
        taskFeatures={selectedTask ? {
          task: selectedTask,
          isActive,
          onPin: () => this.onTaskPin(selectedTask),
          onActivate: () => this.onTaskActivate(selectedTask),
        } : undefined}
        onIssueUpdated={this.onIssueUpdated}
      />
    )
  }

  private renderContentForIssues(): JSX.Element | null {
    const { selectedIssueInfo } = this.state
    const { repository, accounts, tasksState } = this.props

    if (!selectedIssueInfo) {
      // Show empty state when no issue is selected
      return (
        <div className="task-content-empty">
          <div className="empty-state">
            <p>Select an issue from the list to view details</p>
          </div>
        </div>
      )
    }

    // Get account and repo info for the API
    if (!isRepositoryWithGitHubRepository(repository)) {
      return null
    }

    const account = accounts.find(
      a => a.endpoint === repository.gitHubRepository.endpoint
    )
    if (!account) {
      return null
    }

    const owner = repository.gitHubRepository.owner.login
    const repo = repository.gitHubRepository.name

    return (
      <IssueDetailView
        owner={owner}
        repo={repo}
        issue={selectedIssueInfo}
        account={account}
        projects={tasksState.projects}
        onBack={this.onTaskDetailBack}
        onOpenInBrowser={() => shell.openExternal(selectedIssueInfo.url)}
        onIssueUpdated={this.onIssueUpdated}
      />
    )
  }

  private onIssueUpdated = () => {
    // Refresh tasks and issues when an issue is updated
    const { repository } = this.props
    if (isRepositoryWithGitHubRepository(repository)) {
      this.props.dispatcher.refreshTasks(repository)
      this.props.dispatcher.refreshRepositoryIssues(repository)
    }
  }

  private renderContentForHistory(): JSX.Element {
    const { commitSelection, commitLookup, localCommitSHAs } = this.props.state
    const { changesetData, file, diff, shas, shasInDiff, isContiguous } =
      commitSelection

    const selectedCommits = []
    for (const sha of shas) {
      const commit = commitLookup.get(sha)
      if (commit !== undefined) {
        selectedCommits.push(commit)
      }
    }

    const showDragOverlay = dragAndDropManager.isDragOfTypeInProgress(
      DragType.Commit
    )

    return (
      <SelectedCommits
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        selectedCommits={selectedCommits}
        shasInDiff={shasInDiff}
        isContiguous={isContiguous}
        localCommitSHAs={localCommitSHAs}
        changesetData={changesetData}
        selectedFile={file}
        currentDiff={diff}
        emoji={this.props.emoji}
        commitSummaryWidth={this.props.commitSummaryWidth}
        selectedDiffType={this.props.imageDiffType}
        externalEditorLabel={this.props.externalEditorLabel}
        onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        hideWhitespaceInDiff={this.props.hideWhitespaceInHistoryDiff}
        showSideBySideDiff={this.props.showSideBySideDiff}
        onOpenBinaryFile={this.onOpenBinaryFile}
        onOpenSubmodule={this.onOpenSubmodule}
        onChangeImageDiffType={this.onChangeImageDiffType}
        onDiffOptionsOpened={this.onDiffOptionsOpened}
        showDragOverlay={showDragOverlay}
        accounts={this.props.accounts}
      />
    )
  }

  private onDiffOptionsOpened = () => {
    this.props.dispatcher.incrementMetric('diffOptionsViewedCount')
  }

  private onTutorialCompletionAnnounced = () => {
    this.props.dispatcher.markTutorialCompletionAsAnnounced(
      this.props.repository
    )
  }

  private renderTutorialPane(): JSX.Element {
    if (
      [TutorialStep.AllDone, TutorialStep.Announced].includes(
        this.props.currentTutorialStep
      )
    ) {
      return (
        <TutorialDone
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          tutorialCompletionAnnounced={
            this.props.currentTutorialStep === TutorialStep.Announced
          }
          onTutorialCompletionAnnounced={this.onTutorialCompletionAnnounced}
        />
      )
    } else {
      return <TutorialWelcome />
    }
  }

  private renderContentForChanges(): JSX.Element | null {
    const { changesState } = this.props.state
    const { workingDirectory, selection } = changesState

    if (selection.kind === ChangesSelectionKind.Stash) {
      return this.renderStashedChangesContent()
    }

    const { selectedFileIDs, diff } = selection

    if (selectedFileIDs.length > 1) {
      return <MultipleSelection count={selectedFileIDs.length} />
    }

    if (workingDirectory.files.length === 0) {
      if (this.props.currentTutorialStep !== TutorialStep.NotApplicable) {
        return this.renderTutorialPane()
      } else {
        return (
          <NoChanges
            key={this.props.repository.id}
            appMenu={this.props.appMenu}
            repository={this.props.repository}
            repositoryState={this.props.state}
            isExternalEditorAvailable={this.props.isExternalEditorAvailable}
            dispatcher={this.props.dispatcher}
            pullRequestSuggestedNextAction={
              this.props.pullRequestSuggestedNextAction
            }
          />
        )
      }
    } else {
      if (selectedFileIDs.length === 0) {
        return null
      }

      const selectedFile = workingDirectory.findFileWithID(selectedFileIDs[0])

      if (selectedFile === null) {
        return null
      }

      return (
        <Changes
          repository={this.props.repository}
          dispatcher={this.props.dispatcher}
          file={selectedFile}
          diff={diff}
          isCommitting={this.props.state.isCommitting}
          imageDiffType={this.props.imageDiffType}
          hideWhitespaceInDiff={this.props.hideWhitespaceInChangesDiff}
          showSideBySideDiff={this.props.showSideBySideDiff}
          showDiffCheckMarks={this.props.showDiffCheckMarks}
          onOpenBinaryFile={this.onOpenBinaryFile}
          onOpenSubmodule={this.onOpenSubmodule}
          onChangeImageDiffType={this.onChangeImageDiffType}
          askForConfirmationOnDiscardChanges={
            this.props.askForConfirmationOnDiscardChanges
          }
          onDiffOptionsOpened={this.onDiffOptionsOpened}
        />
      )
    }
  }

  private onOpenBinaryFile = (fullPath: string) => {
    openFile(fullPath, this.props.dispatcher)
  }

  private onOpenSubmodule = (fullPath: string) => {
    this.props.dispatcher.incrementMetric('openSubmoduleFromDiffCount')
    this.props.dispatcher.openOrAddRepository(fullPath)
  }

  private onChangeImageDiffType = (imageDiffType: ImageDiffType) => {
    this.props.dispatcher.changeImageDiffType(imageDiffType)
  }

  private renderContent(): JSX.Element | null {
    const selectedSection = this.props.state.selectedSection
    if (selectedSection === RepositorySectionTab.Code) {
      return this.renderContentForCode()
    } else if (selectedSection === RepositorySectionTab.Changes) {
      return this.renderContentForChanges()
    } else if (selectedSection === RepositorySectionTab.History) {
      return this.renderContentForHistory()
    } else if (selectedSection === RepositorySectionTab.Tasks) {
      return this.renderContentForTasks()
    } else if (selectedSection === RepositorySectionTab.Issues) {
      return this.renderContentForIssues()
    } else {
      return assertNever(selectedSection, 'Unknown repository section')
    }
  }

  public render() {
    return (
      <UiView id="repository">
        {this.renderSidebar()}
        {this.renderContent()}
        {this.maybeRenderTutorialPanel()}
      </UiView>
    )
  }

  private onRevertCommit = (commit: Commit) => {
    this.props.dispatcher.revertCommit(this.props.repository, commit)
  }

  private onAmendCommit = (commit: Commit, isLocalCommit: boolean) => {
    this.props.dispatcher.startAmendingRepository(
      this.props.repository,
      commit,
      isLocalCommit
    )
  }

  public componentDidMount() {
    window.addEventListener('keydown', this.onGlobalKeyDown)

    // Check for pending wiki link navigation (from cross-repo link)
    this.checkPendingWikiLink()
  }

  private checkPendingWikiLink() {
    const pendingFile = localStorage.getItem('pending-wiki-link-file')
    if (pendingFile) {
      localStorage.removeItem('pending-wiki-link-file')
      // Verify the file is in the current repository
      if (pendingFile.startsWith(this.props.repository.path)) {
        // Small delay to ensure the component is fully mounted
        setTimeout(() => {
          // Switch to Code section
          this.props.dispatcher.changeRepositorySection(
            this.props.repository,
            RepositorySectionTab.Code
          )
          // Open the file (adds tab if needed, switches if exists)
          this.onCodeFileSelected(pendingFile)
        }, 100)
      }
    }
  }

  public componentWillUnmount() {
    window.removeEventListener('keydown', this.onGlobalKeyDown)
  }

  public componentDidUpdate(
    prevProps: IRepositoryViewProps,
    prevState: IRepositoryViewState
  ): void {
    if (this.focusChangesNeeded) {
      this.focusChangesNeeded = false
      this.changesSidebarRef.current?.focus()
    }

    if (this.focusHistoryNeeded) {
      this.focusHistoryNeeded = false
      this.compareSidebarRef.current?.focusHistory()
    }

    // Handle repository change - save current tabs and load new repo's tabs
    if (prevProps.repository.id !== this.props.repository.id) {
      // Save tabs for the previous repository
      this.saveTabsForRepository(
        prevProps.repository.id,
        prevState.openCodeTabs,
        prevState.activeCodeTab
      )

      // Load tabs for the new repository
      const { openCodeTabs, activeCodeTab } = this.loadTabsForRepository(this.props.repository.id)
      this.setState({ openCodeTabs, activeCodeTab }, () => {
        // Check for pending wiki link after tabs are loaded
        this.checkPendingWikiLink()
      })
      return
    }

    // Persist code view tabs to localStorage when they change
    if (
      prevState.openCodeTabs !== this.state.openCodeTabs ||
      prevState.activeCodeTab !== this.state.activeCodeTab
    ) {
      this.saveTabsForRepository(
        this.props.repository.id,
        this.state.openCodeTabs,
        this.state.activeCodeTab
      )
    }
  }

  private onGlobalKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    if (this.props.isShowingModal || this.props.isShowingFoldout) {
      return
    }

    // Toggle tab selection on Ctrl+Tab. Note that we don't care
    // about the shift key here, we can get away with that as long
    // as there's only two tabs.
    if (event.ctrlKey && event.key === 'Tab') {
      this.changeTab()
      event.preventDefault()
    }
  }

  private changeTab() {
    const section =
      this.props.state.selectedSection === RepositorySectionTab.History
        ? RepositorySectionTab.Changes
        : RepositorySectionTab.History

    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      section
    )
  }

  private onTabClicked = (tab: Tab) => {
    let section: RepositorySectionTab
    if (tab === Tab.Code) {
      section = RepositorySectionTab.Code
    } else if (tab === Tab.History) {
      section = RepositorySectionTab.History
    } else if (tab === Tab.Tasks) {
      section = RepositorySectionTab.Tasks
    } else if (tab === Tab.Issues) {
      section = RepositorySectionTab.Issues
    } else {
      section = RepositorySectionTab.Changes
    }

    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      section
    )
    if (
      section !== RepositorySectionTab.Tasks &&
      section !== RepositorySectionTab.Issues &&
      section !== RepositorySectionTab.Code
    ) {
      this.props.dispatcher.updateCompareForm(this.props.repository, {
        showBranchList: false,
      })
    }

    // Fetch projects when switching to Tasks tab
    if (
      section === RepositorySectionTab.Tasks &&
      isRepositoryWithGitHubRepository(this.props.repository)
    ) {
      this.props.dispatcher.fetchProjects(this.props.repository)
    }

    // Fetch issues when switching to Issues tab
    if (
      section === RepositorySectionTab.Issues &&
      isRepositoryWithGitHubRepository(this.props.repository)
    ) {
      this.props.dispatcher.refreshRepositoryIssues(this.props.repository)
    }
  }

  private maybeRenderTutorialPanel(): JSX.Element | null {
    if (isValidTutorialStep(this.props.currentTutorialStep)) {
      return (
        <TutorialPanel
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          resolvedExternalEditor={this.props.resolvedExternalEditor}
          currentTutorialStep={this.props.currentTutorialStep}
          onExitTutorial={this.props.onExitTutorial}
        />
      )
    }
    return null
  }
}
