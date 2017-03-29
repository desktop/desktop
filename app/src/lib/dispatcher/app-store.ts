import { Emitter, Disposable } from 'event-kit'
import { ipcRenderer } from 'electron'
import * as Path from 'path'
import {
  IRepositoryState,
  IHistoryState,
  IAppState,
  RepositorySection,
  IChangesState,
  Popup,
  FoldoutType,
  Foldout,
  IBranchesState,
  PossibleSelections,
  SelectionType,
} from '../app-state'
import { User } from '../../models/user'
import { Repository } from '../../models/repository'
import { GitHubRepository } from '../../models/github-repository'
import { FileChange, WorkingDirectoryStatus, WorkingDirectoryFileChange } from '../../models/status'
import { DiffSelection, DiffSelectionType, DiffType } from '../../models/diff'
import { matchGitHubRepository } from '../../lib/repository-matching'
import { API, getUserForEndpoint, IAPIUser } from '../../lib/api'
import { caseInsensitiveCompare } from '../compare'
import { Branch, BranchType } from '../../models/branch'
import { TipState } from '../../models/tip'
import { Commit } from '../../models/commit'
import { CloningRepository, CloningRepositoriesStore } from './cloning-repositories-store'
import { IGitHubUser } from './github-user-database'
import { GitHubUserStore } from './github-user-store'
import { shell } from './app-shell'
import { EmojiStore } from './emoji-store'
import { GitStore, ICommitMessage } from './git-store'
import { assertNever } from '../fatal-error'
import { IssuesStore } from './issues-store'
import { BackgroundFetcher } from './background-fetcher'
import { formatCommitMessage } from '../format-commit-message'
import { AppMenu, IMenu } from '../../models/app-menu'
import { getAppMenu } from '../../ui/main-process-proxy'
import { merge } from '../merge'
import { getAppPath } from '../../ui/lib/app-proxy'
import { StatsStore, ILaunchStats } from '../stats'
import { SignInStore } from './sign-in-store'

import {
  getGitDir,
  getStatus,
  getConfigValue,
  getAuthorIdentity,
  pull as pullRepo,
  push as pushRepo,
  createBranch,
  renameBranch,
  deleteBranch,
  getCommitDiff,
  getWorkingDirectoryDiff,
  getChangedFiles,
  updateRef,
  addRemote,
  getBranchAheadBehind,
  createCommit,
  checkoutBranch,
} from '../git'

import { openShell } from '../open-shell'

const LastSelectedRepositoryIDKey = 'last-selected-repository-id'

/** The `localStorage` key for whether we've shown the Welcome flow yet. */
const HasShownWelcomeFlowKey = 'has-shown-welcome-flow'

const defaultSidebarWidth: number = 250
const sidebarWidthConfigKey: string = 'sidebar-width'

const defaultCommitSummaryWidth: number = 250
const commitSummaryWidthConfigKey: string = 'commit-summary-width'

export class AppStore {
  private emitter = new Emitter()

  private users: ReadonlyArray<User> = new Array<User>()
  private repositories: ReadonlyArray<Repository> = new Array<Repository>()

  private selectedRepository: Repository | CloningRepository | null = null

  /** The background fetcher for the currently selected repository. */
  private currentBackgroundFetcher: BackgroundFetcher | null = null

  private repositoryState = new Map<number, IRepositoryState>()
  private loading = false
  private showWelcomeFlow = false

  private currentPopup: Popup | null = null
  private currentFoldout: Foldout | null = null

  private errors: ReadonlyArray<Error> = new Array<Error>()

  private emitQueued = false

  public readonly gitHubUserStore: GitHubUserStore

  private readonly cloningRepositoriesStore: CloningRepositoriesStore

  private readonly emojiStore: EmojiStore

  private readonly _issuesStore: IssuesStore

  /** The issues store for all repositories. */
  public get issuesStore(): IssuesStore { return this._issuesStore }

  /** GitStores keyed by their associated Repository ID. */
  private readonly gitStores = new Map<number, GitStore>()

  private readonly signInStore: SignInStore

  /**
   * The Application menu as an AppMenu instance or null if
   * the main process has not yet provided the renderer with
   * a copy of the application menu structure.
   */
  private appMenu: AppMenu | null = null

  /**
   * Used to highlight access keys throughout the app when the
   * Alt key is pressed. Only applicable on non-macOS platforms.
   */
  private highlightAccessKeys: boolean = false

  private sidebarWidth: number = defaultSidebarWidth
  private commitSummaryWidth: number = defaultCommitSummaryWidth

  private readonly statsStore: StatsStore

  public constructor(gitHubUserStore: GitHubUserStore, cloningRepositoriesStore: CloningRepositoriesStore, emojiStore: EmojiStore, issuesStore: IssuesStore, statsStore: StatsStore, signInStore: SignInStore) {
    this.gitHubUserStore = gitHubUserStore
    this.cloningRepositoriesStore = cloningRepositoriesStore
    this.emojiStore = emojiStore
    this._issuesStore = issuesStore
    this.statsStore = statsStore
    this.signInStore = signInStore

    const hasShownWelcomeFlow = localStorage.getItem(HasShownWelcomeFlowKey)
    this.showWelcomeFlow = !hasShownWelcomeFlow || !parseInt(hasShownWelcomeFlow, 10)

    ipcRenderer.on('app-menu', (event: Electron.IpcRendererEvent, { menu }: { menu: IMenu }) => {
      this.setAppMenu(menu)
    })

    getAppMenu()

    this.gitHubUserStore.onDidUpdate(() => {
      this.emitUpdate()
    })

    this.cloningRepositoriesStore.onDidUpdate(() => {
      this.emitUpdate()
    })

    this.cloningRepositoriesStore.onDidError(e => this.emitError(e))

    this.signInStore.onDidAuthenticate(user => this.emitAuthenticate(user))
    this.signInStore.onDidUpdate(() => this.emitUpdate())
    this.signInStore.onDidError(error => this.emitError(error))

    const rootDir = getAppPath()
    this.emojiStore.read(rootDir).then(() => this.emitUpdate())
  }

  private emitAuthenticate(user: User) {
    this.emitter.emit('did-authenticate', user)
  }

  private emitUpdate() {
    if (this.emitQueued) { return }

    this.emitQueued = true

    window.requestAnimationFrame(() => {
      this.emitQueued = false
      this.emitter.emit('did-update', this.getState())
    })
  }

  /**
   * Registers an event handler which will be invoked whenever
   * a user has successfully completed a sign-in process.
   */
  public onDidAuthenticate(fn: (user: User) => void): Disposable {
    return this.emitter.on('did-authenticate', fn)
  }

  public onDidUpdate(fn: (state: IAppState) => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  private emitError(error: Error) {
    this.emitter.emit('did-error', error)
  }

  /** Register a listener for when an error occurs. */
  public onDidError(fn: (error: Error) => void): Disposable {
    return this.emitter.on('did-error', fn)
  }

  private getInitialRepositoryState(): IRepositoryState {
    return {
      historyState: {
        selection: {
          sha: null,
          file: null,
        },
        changedFiles: new Array<FileChange>(),
        history: new Array<string>(),
        diff: null,
      },
      changesState: {
        workingDirectory: new WorkingDirectoryStatus(new Array<WorkingDirectoryFileChange>(), true),
        selectedFile: null,
        diff: null,
        contextualCommitMessage: null,
        commitMessage: null,
      },
      selectedSection: RepositorySection.Changes,
      branchesState: {
        tip: { kind: TipState.Unknown },
        defaultBranch: null,
        allBranches: new Array<Branch>(),
        recentBranches: new Array<Branch>(),
      },
      commitAuthor: null,
      gitHubUsers: new Map<string, IGitHubUser>(),
      commits: new Map<string, Commit>(),
      localCommitSHAs: [],
      aheadBehind: null,
      remote: null,
      pushPullInProgress: false,
      isCommitting: false,
      lastFetched: null,
    }
  }

  /** Get the state for the repository. */
  public getRepositoryState(repository: Repository): IRepositoryState {
    let state = this.repositoryState.get(repository.id)
    if (state) {
      const gitHubUsers = this.gitHubUserStore.getUsersForRepository(repository) || new Map<string, IGitHubUser>()
      return merge(state, { gitHubUsers })
    }

    state = this.getInitialRepositoryState()
    this.repositoryState.set(repository.id, state)
    return state
  }

  private updateRepositoryState<K extends keyof IRepositoryState>(repository: Repository, fn: (state: IRepositoryState) => Pick<IRepositoryState, K>) {
    const currentState = this.getRepositoryState(repository)
    const newValues = fn(currentState)
    this.repositoryState.set(repository.id, merge(currentState, newValues))
  }

  private updateHistoryState<K extends keyof IHistoryState>(repository: Repository, fn: (historyState: IHistoryState) => Pick<IHistoryState, K>) {
    this.updateRepositoryState(repository, state => {
      const historyState = state.historyState
      const newValues = fn(historyState)
      return { historyState: merge(historyState, newValues) }
    })
  }

  private updateChangesState<K extends keyof IChangesState>(repository: Repository, fn: (changesState: IChangesState) => Pick<IChangesState, K>) {
    this.updateRepositoryState(repository, state => {
      const changesState = state.changesState
      const newValues = fn(changesState)
      return { changesState: merge(changesState, newValues) }
    })
  }

  private updateBranchesState(repository: Repository, fn: (branchesState: IBranchesState) => IBranchesState) {
    this.updateRepositoryState(repository, state => {
      const branchesState = fn(state.branchesState)
      return { branchesState }
    })
  }

  private getSelectedState(): PossibleSelections | null {
    const repository = this.selectedRepository
    if (!repository) { return null }

    if (repository instanceof CloningRepository) {
      const cloningState = this.cloningRepositoriesStore.getRepositoryState(repository)
      if (!cloningState) { return null }

      return {
        type: SelectionType.CloningRepository,
        repository,
        state: cloningState,
      }
    }

    if (repository.missing) {
      return {
        type: SelectionType.MissingRepository,
        repository,
      }
    }

    return {
      type: SelectionType.Repository,
      repository,
      state: this.getRepositoryState(repository),
    }
  }

  public getState(): IAppState {
    return {
      users: this.users,
      repositories: [
        ...this.repositories,
        ...this.cloningRepositoriesStore.repositories,
      ],
      selectedState: this.getSelectedState(),
      signInState: this.signInStore.getState(),
      currentPopup: this.currentPopup,
      currentFoldout: this.currentFoldout,
      errors: this.errors,
      loading: this.loading,
      showWelcomeFlow: this.showWelcomeFlow,
      emoji: this.emojiStore.emoji,
      sidebarWidth: this.sidebarWidth,
      commitSummaryWidth: this.commitSummaryWidth,
      appMenuState: this.appMenu ? this.appMenu.openMenus : [],
      titleBarStyle: this.showWelcomeFlow ? 'light' : 'dark',
      highlightAccessKeys: this.highlightAccessKeys,
    }
  }

  private onGitStoreUpdated(repository: Repository, gitStore: GitStore) {
    this.updateHistoryState(repository, state => (
      { history: gitStore.history }
    ))

    this.updateBranchesState(repository, state => (
      {
        tip: gitStore.tip,
        defaultBranch: gitStore.defaultBranch,
        allBranches: gitStore.allBranches,
        recentBranches: gitStore.recentBranches,
      }
    ))

    this.updateChangesState(repository, state => (
      {
        commitMessage: gitStore.commitMessage,
        contextualCommitMessage: gitStore.contextualCommitMessage,
      }
    ))

    this.updateRepositoryState(repository, state => (
      {
        commits: gitStore.commits,
        localCommitSHAs: gitStore.localCommitSHAs,
        aheadBehind: gitStore.aheadBehind,
        remote: gitStore.remote,
        lastFetched: gitStore.lastFetched,
      }
    ))

    this.emitUpdate()
  }

  private onGitStoreLoadedCommits(repository: Repository, commits: ReadonlyArray<Commit>) {
    for (const commit of commits) {
      this.gitHubUserStore._loadAndCacheUser(this.users, repository, commit.sha, commit.author.email)
    }
  }

  private removeGitStore(repository: Repository) {
    if (this.gitStores.has(repository.id)) {
      this.gitStores.delete(repository.id)
    }
  }

  private getGitStore(repository: Repository): GitStore {
    let gitStore = this.gitStores.get(repository.id)
    if (!gitStore) {
      gitStore = new GitStore(repository, shell)
      gitStore.onDidUpdate(() => this.onGitStoreUpdated(repository, gitStore!))
      gitStore.onDidLoadNewCommits(commits => this.onGitStoreLoadedCommits(repository, commits))
      gitStore.onDidError(error => this.emitError(error))

      this.gitStores.set(repository.id, gitStore)
    }

    return gitStore
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadHistory(repository: Repository): Promise<void> {
    const gitStore = this.getGitStore(repository)
    await gitStore.loadHistory()

    const state = this.getRepositoryState(repository).historyState
    let newSelection = state.selection
    const history = state.history
    const selectedSHA = state.selection.sha
    if (selectedSHA) {
      const index = history.findIndex(sha => sha === selectedSHA)
      // Our selected SHA disappeared, so clear the selection.
      if (index < 0) {
        newSelection = {
          sha: null,
          file: null,
        }
      }
    }

    if (!newSelection.sha && history.length > 0) {
      this._changeHistoryCommitSelection(repository, history[0])
      this._loadChangedFilesForCurrentSelection(repository)
    }

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _loadNextHistoryBatch(repository: Repository): Promise<void> {
    const gitStore = this.getGitStore(repository)
    return gitStore.loadNextHistoryBatch()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadChangedFilesForCurrentSelection(repository: Repository): Promise<void> {
    const state = this.getRepositoryState(repository)
    const selection = state.historyState.selection
    const currentSHA = selection.sha
    if (!currentSHA) { return }

    const gitStore = this.getGitStore(repository)
    const changedFiles = await gitStore.performFailableOperation(() => getChangedFiles(repository, currentSHA))
    if (!changedFiles) { return }

    // The selection could have changed between when we started loading the
    // changed files and we finished. We might wanna store the changed files per
    // SHA/path.
    if (currentSHA !== state.historyState.selection.sha) {
      return
    }

    // if we're selecting a commit for the first time, we should select the
    // first file in the commit and render the diff immediately

    const noFileSelected = selection.file === null

    const firstFileOrDefault = noFileSelected && changedFiles.length
      ? changedFiles[0]
      : selection.file

    const selectionOrFirstFile = {
      file: firstFileOrDefault,
      sha: selection.sha,
    }

    this.updateHistoryState(repository, state => ({ changedFiles }))

    this.emitUpdate()

    if (selectionOrFirstFile.file) {
      this._changeHistoryFileSelection(repository, selectionOrFirstFile.file)
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeHistoryCommitSelection(repository: Repository, sha: string): Promise<void> {
    this.updateHistoryState(repository, state => {
      const commitChanged = state.selection.sha !== sha
      const changedFiles = commitChanged ? new Array<FileChange>() : state.changedFiles
      const file = commitChanged ? null : state.selection.file
      const selection = { sha, file }
      const diff = null

      return { selection, changedFiles, diff }
    })
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeHistoryFileSelection(repository: Repository, file: FileChange): Promise<void> {

    this.updateHistoryState(repository, state => {
      const selection = { sha: state.selection.sha, file }
      const diff = null
      return { selection, diff }
    })
    this.emitUpdate()

    const stateBeforeLoad = this.getRepositoryState(repository)
    const sha = stateBeforeLoad.historyState.selection.sha

    if (!sha) {
      if (__DEV__) {
        throw new Error('No currently selected sha yet we\'ve been asked to switch file selection')
      } else {
        return
      }
    }

    const diff = await getCommitDiff(repository, file, sha)

    const stateAfterLoad = this.getRepositoryState(repository)

    // A whole bunch of things could have happened since we initiated the diff load
    if (stateAfterLoad.historyState.selection.sha !== stateBeforeLoad.historyState.selection.sha) { return }
    if (!stateAfterLoad.historyState.selection.file) { return }
    if (stateAfterLoad.historyState.selection.file.id !== file.id) { return }

    this.updateHistoryState(repository, state => {
      const selection = { sha: state.selection.sha, file }
      return { selection, diff }
    })

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _selectRepository(repository: Repository | CloningRepository | null): Promise<void> {
    this.selectedRepository = repository
    this.emitUpdate()

    this.stopBackgroundFetching()

    if (!repository) { return Promise.resolve() }
    if (!(repository instanceof Repository)) { return Promise.resolve() }

    localStorage.setItem(LastSelectedRepositoryIDKey, repository.id.toString())

    if (repository.missing) {
      // as the repository is no longer found on disk, cleaning this up
      // ensures we don't accidentally run any Git operations against the
      // wrong location if the user then relocates the `.git` folder elsewhere
      this.removeGitStore(repository)
      return
    }

    const gitHubRepository = repository.gitHubRepository
    if (gitHubRepository) {
      this._updateIssues(gitHubRepository)
    }

    await this._refreshRepository(repository)

    this.startBackgroundFetching(repository)
    this.refreshMentionables(repository)
  }

  public async _updateIssues(repository: GitHubRepository) {
    const user = this.users.find(u => u.endpoint === repository.endpoint)
    if (!user) { return }

    try {
      await this._issuesStore.fetchIssues(repository, user)
    } catch (e) {
      console.warn(`Unable to fetch issues for ${repository.fullName}: ${e}`)
    }
  }

  private stopBackgroundFetching() {
    const backgroundFetcher = this.currentBackgroundFetcher
    if (backgroundFetcher) {
      backgroundFetcher.stop()
      this.currentBackgroundFetcher = null
    }
  }

  private refreshMentionables(repository: Repository) {
    const user = this.getUserForRepository(repository)
    if (!user) { return }

    const gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) { return }

    this.gitHubUserStore.updateMentionables(gitHubRepository, user)
  }

  private startBackgroundFetching(repository: Repository) {
    const user = this.getUserForRepository(repository)
    if (!user) { return }

    if (!repository.gitHubRepository) { return }

    const fetcher = new BackgroundFetcher(repository, user, r => this.fetch(r))
    fetcher.start()
    this.currentBackgroundFetcher = fetcher
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _loadFromSharedProcess(users: ReadonlyArray<User>, repositories: ReadonlyArray<Repository>) {
    this.users = users
    this.repositories = repositories
    this.loading = this.repositories.length === 0 && this.users.length === 0

    for (const user of users) {
      // In theory a user should _always_ have an array of emails (even if it's
      // empty). But in practice, if the user had run old dev builds this may
      // not be the case. So for now we need to guard this. We should remove
      // this check in the not too distant future.
      // @joshaber (August 10, 2016)
      if (!user.emails) { break }

      const gitUsers = user.emails.map(email => ({ ...user, email }))

      for (const user of gitUsers) {
        this.gitHubUserStore.cacheUser(user)
      }
    }

    const selectedRepository = this.selectedRepository
    let newSelectedRepository: Repository | CloningRepository | null = this.selectedRepository
    if (selectedRepository) {
      const r = this.repositories.find(r =>
        r.constructor === selectedRepository.constructor && r.id === selectedRepository.id
      ) || null

      newSelectedRepository = r
    }

    if (newSelectedRepository === null && this.repositories.length > 0) {
      const lastSelectedID = parseInt(localStorage.getItem(LastSelectedRepositoryIDKey) || '', 10)
      if (lastSelectedID && !isNaN(lastSelectedID)) {
        newSelectedRepository = this.repositories.find(r => r.id === lastSelectedID) || null
      }

      if (!newSelectedRepository) {
        newSelectedRepository = this.repositories[0]
      }
    }

    this._selectRepository(newSelectedRepository)

    this.sidebarWidth = parseInt(localStorage.getItem(sidebarWidthConfigKey) || '', 10) || defaultSidebarWidth
    this.commitSummaryWidth = parseInt(localStorage.getItem(commitSummaryWidthConfigKey) || '', 10) || defaultCommitSummaryWidth

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadStatus(repository: Repository, clearPartialState: boolean = false): Promise<void> {
    const gitStore = this.getGitStore(repository)
    const status = await gitStore.performFailableOperation(() => getStatus(repository))
    if (!status) { return }

    let selectedFile: WorkingDirectoryFileChange | null = null
    this.updateChangesState(repository, state => {

      // Populate a map for all files in the current working directory state
      const filesByID = new Map<string, WorkingDirectoryFileChange>()
      state.workingDirectory.files.forEach(f => filesByID.set(f.id, f))

      // Attempt to preserve the selection state for each file in the new
      // working directory state by looking at the current files
      const mergedFiles = status.workingDirectory.files.map(file => {
        const existingFile = filesByID.get(file.id)
        if (existingFile) {

          if (clearPartialState) {
            if (existingFile.selection.getSelectionType() === DiffSelectionType.Partial) {
              return file.withIncludeAll(false)
            }
          }

          return file.withSelection(existingFile.selection)
        } else {
          return file
        }
      })
      .sort((x, y) => caseInsensitiveCompare(x.path, y.path))

      const includeAll = this.getIncludeAllState(mergedFiles)

      // Try to find the currently selected file among the files
      // in the new working directory state. Matching by id is
      // different from matching by path since id includes the
      // change type (new, modified, deleted etc)
      if (state.selectedFile) {
        selectedFile = mergedFiles.find(f => f.id === state.selectedFile!.id) || null
      }

      const fileSelectionChanged = selectedFile == null

      if (!selectedFile && mergedFiles.length) {
        selectedFile = mergedFiles[0] || null
      }

      const workingDirectory = new WorkingDirectoryStatus(mergedFiles, includeAll)

      // The file selection could have changed if the previously selected
      // file is no longer selectable (it was reverted or committed) but
      // if it hasn't changed we can reuse the diff
      const diff = fileSelectionChanged ? null : state.diff

      return { workingDirectory, selectedFile, diff }
    })
    this.emitUpdate()

    this.updateChangesDiffForCurrentSelection(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeRepositorySection(repository: Repository, selectedSection: RepositorySection): Promise<void> {
    this.updateRepositoryState(repository, state => ({ selectedSection }))
    this.emitUpdate()

    if (selectedSection === RepositorySection.History) {
      return this.refreshHistorySection(repository)
    } else if (selectedSection === RepositorySection.Changes) {
      return this.refreshChangesSection(repository, { includingStatus: true, clearPartialState: false })
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeChangesSelection(repository: Repository, selectedFile: WorkingDirectoryFileChange | null): Promise<void> {
    this.updateChangesState(repository, state => (
      { selectedFile, diff: null }
    ))
    this.emitUpdate()

    await this.updateChangesDiffForCurrentSelection(repository)
  }

  /**
   * Loads or re-loads (refreshes) the diff for the currently selected file
   * in the working directory. This operation is a noop if there's no currently
   * selected file.
   */
  private async updateChangesDiffForCurrentSelection(repository: Repository): Promise<void> {
    const stateBeforeLoad = this.getRepositoryState(repository)
    const currentSelectedFile = stateBeforeLoad.changesState.selectedFile

    if (!currentSelectedFile) { return }

    const diff = await getWorkingDirectoryDiff(repository, currentSelectedFile)

    const stateAfterLoad = this.getRepositoryState(repository)
    const changesState = stateAfterLoad.changesState

    // A whole bunch of things could have happened since we initiated the diff load
    if (!changesState.selectedFile) { return }
    if (changesState.selectedFile.id !== currentSelectedFile.id) { return }

    const selectableLines = new Set<number>()
    if (diff.kind === DiffType.Text) {
      // The diff might have changed dramatically since last we loaded it. Ideally we
      // would be more clever about validating that any partial selection state is
      // still valid by ensuring that selected lines still exist but for now we'll
      // settle on just updating the selectable lines such that any previously selected
      // line which now no longer exists or has been turned into a context line
      // isn't still selected.
      diff.hunks.forEach(h => {
        h.lines.forEach((line, index) => {
          if (line.isIncludeableLine()) {
            selectableLines.add(h.unifiedDiffStart + index)
          }
        })
      })
    }

    const newSelection = currentSelectedFile.selection.withSelectableLines(selectableLines)
    const selectedFile = currentSelectedFile.withSelection(newSelection)

    const workingDirectory = changesState.workingDirectory.byReplacingFile(selectedFile)
    this.updateChangesState(repository, state => ({ selectedFile, diff, workingDirectory }))
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _commitIncludedChanges(repository: Repository, message: ICommitMessage): Promise<boolean> {

    const state = this.getRepositoryState(repository)
    const files = state.changesState.workingDirectory.files.filter((file, index, array) => {
      return file.selection.getSelectionType() !== DiffSelectionType.None
    })

    const gitStore = this.getGitStore(repository)

    const result = await this.isCommitting(repository, () => {
      return gitStore.performFailableOperation(() => {
        const commitMessage = formatCommitMessage(message)
        return createCommit(repository, commitMessage, files)
      })
    })

    if (result) {
      this.statsStore.recordCommit()

      await this._refreshRepository(repository)
      await this.refreshChangesSection(repository, { includingStatus: true, clearPartialState: true })
    }

    return result || false
  }

  private getIncludeAllState(files: ReadonlyArray<WorkingDirectoryFileChange>): boolean | null {
    const allSelected = files.every(f => f.selection.getSelectionType() === DiffSelectionType.All)
    const noneSelected = files.every(f => f.selection.getSelectionType() === DiffSelectionType.None)

    let includeAll: boolean | null = null
    if (allSelected) {
      includeAll = true
    } else if (noneSelected) {
      includeAll = false
    }

    return includeAll
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeFileIncluded(repository: Repository, file: WorkingDirectoryFileChange, include: boolean): Promise<void> {
    const selection = include ? file.selection.withSelectAll() : file.selection.withSelectNone()
    this.updateWorkingDirectoryFileSelection(repository, file, selection)
    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeFileLineSelection(repository: Repository, file: WorkingDirectoryFileChange, diffSelection: DiffSelection): Promise<void> {
    this.updateWorkingDirectoryFileSelection(repository, file, diffSelection)
    return Promise.resolve()
  }

  /**
   * Updates the selection for the given file in the working directory
   * state and emits an update event.
   */
  private updateWorkingDirectoryFileSelection(repository: Repository, file: WorkingDirectoryFileChange, selection: DiffSelection) {

    this.updateChangesState(repository, state => {

      const newFiles = state.workingDirectory.files.map(f =>
        f.id === file.id ? f.withSelection(selection) : f
      )

      const includeAll = this.getIncludeAllState(newFiles)

      let selectedFile: WorkingDirectoryFileChange | null = null
      if (state.selectedFile) {
        const f = state.selectedFile
        selectedFile = newFiles.find(file => file.id === f.id) || null
      }

      const workingDirectory = new WorkingDirectoryStatus(newFiles, includeAll)
      const diff = selectedFile ? state.diff : null

      return { workingDirectory, selectedFile, diff }
    })

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeIncludeAllFiles(repository: Repository, includeAll: boolean): Promise<void> {
    this.updateChangesState(repository, state => {

      const selectedFile = state.selectedFile
        ? state.selectedFile.withIncludeAll(includeAll)
        : null

      const workingDirectory = state.workingDirectory.withIncludeAllFiles(includeAll)

      return { workingDirectory, selectedFile }
    })
    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _refreshRepository(repository: Repository): Promise<void> {
    if (repository.missing) { return }

    const state = this.getRepositoryState(repository)
    const gitStore = this.getGitStore(repository)

    await gitStore.loadCurrentAndDefaultBranch()

    // We don't need to await this. The GitStore will notify when something
    // changes.
    gitStore.loadBranches()
    gitStore.loadCurrentRemote()
    gitStore.calculateAheadBehindForCurrentBranch()
    gitStore.updateLastFetched()

    // When refreshing we *always* load Changes so that we can update the
    // changes indicator in the tab bar. But we only load History if it's
    // selected.
    await this._loadStatus(repository)

    await this.refreshAuthor(repository)

    const section = state.selectedSection
    if (section === RepositorySection.History) {
      return this.refreshHistorySection(repository)
    } else if (section === RepositorySection.Changes) {
      return this.refreshChangesSection(repository, { includingStatus: false, clearPartialState: false })
    } else {
      return assertNever(section, `Unknown section: ${section}`)
    }
  }

  /**
   * Refresh all the data for the Changes section.
   *
   * This will be called automatically when appropriate.
   */
  private async refreshChangesSection(repository: Repository, options: { includingStatus: boolean, clearPartialState: boolean }): Promise<void> {
    if (options.includingStatus) {
      await this._loadStatus(repository, options.clearPartialState)
    }

    const gitStore = this.getGitStore(repository)
    const state = this.getRepositoryState(repository)

    if (state.branchesState.tip.kind === TipState.Valid) {
      const currentBranch = state.branchesState.tip.branch
      await gitStore.loadLocalCommits(currentBranch)
    }
  }

  /**
   * Refresh all the data for the History section.
   *
   * This will be called automatically when appropriate.
   */
  private async refreshHistorySection(repository: Repository): Promise<void> {
    return this._loadHistory(repository)
  }

  private async refreshAuthor(repository: Repository): Promise<void> {
    const gitStore = this.getGitStore(repository)
    const commitAuthor = await gitStore.performFailableOperation(() =>
      getAuthorIdentity(repository)
    ) || null

    this.updateRepositoryState(repository, state => ({ commitAuthor }))
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _showPopup(popup: Popup): Promise<void> {
    this.currentPopup = popup
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _closePopup(): Promise<void> {
    this.currentPopup = null
    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _showFoldout(foldout: Foldout): Promise<void> {
    this.currentFoldout = foldout
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _closeFoldout(): Promise<void> {
    this.currentFoldout = null
    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _createBranch(repository: Repository, name: string, startPoint: string): Promise<void> {
    const gitStore = this.getGitStore(repository)
    await gitStore.performFailableOperation(() => createBranch(repository, name, startPoint))
    return this._checkoutBranch(repository, name)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _checkoutBranch(repository: Repository, name: string): Promise<void> {
    const gitStore = this.getGitStore(repository)
    await gitStore.performFailableOperation(() => checkoutBranch(repository, name))

    return this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _repositoryWithRefreshedGitHubRepository(repository: Repository): Promise<Repository> {
    let gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) {
      gitHubRepository = await this.guessGitHubRepository(repository)
    }

    if (!gitHubRepository) { return repository }

    const users = this.users
    const user = getUserForEndpoint(users, gitHubRepository.endpoint)
    if (!user) { return repository }

    const api = new API(user)
    const apiRepo = await api.fetchRepository(gitHubRepository.owner.login, gitHubRepository.name)
    return repository.withGitHubRepository(gitHubRepository.withAPI(apiRepo))
  }

  private async guessGitHubRepository(repository: Repository): Promise<GitHubRepository | null> {
    const gitStore = this.getGitStore(repository)
    // TODO: This is all kinds of wrong.
    // We shouldn't assume the remote is named `origin`.
    const remote = await gitStore.performFailableOperation(() =>
      getConfigValue(repository, 'remote.origin.url')
    )

    return remote ? matchGitHubRepository(this.users, remote) : null
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _pushError(error: Error): Promise<void> {
    const newErrors = Array.from(this.errors)
    newErrors.push(error)
    this.errors = newErrors
    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _clearError(error: Error): Promise<void> {
    this.errors = this.errors.filter(e => e !== error)
    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _validatedRepositoryPath(path: string): Promise<string | null> {
    try {
      const gitDir = await getGitDir(path)
      return gitDir ? Path.dirname(gitDir) : null
    } catch (e) {
      this.emitError(e)
      return null
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _renameBranch(repository: Repository, branch: Branch, newName: string): Promise<void> {
    const gitStore = this.getGitStore(repository)
    await gitStore.performFailableOperation(() => renameBranch(repository, branch, newName))

    return this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _deleteBranch(repository: Repository, branch: Branch): Promise<void> {
    const defaultBranch = this.getRepositoryState(repository).branchesState.defaultBranch
    if (!defaultBranch) {
      return Promise.reject(new Error(`No default branch!`))
    }

    const user = this.getUserForRepository(repository)
    const gitStore = this.getGitStore(repository)

    await gitStore.performFailableOperation(() => checkoutBranch(repository, defaultBranch.name))
    await gitStore.performFailableOperation(() => deleteBranch(repository, branch, user))

    return this._refreshRepository(repository)
  }

  public async _push(repository: Repository): Promise<void> {
    return this.withPushPull(repository, async () => {
      const gitStore = this.getGitStore(repository)
      const remote = gitStore.remote
      if (!remote) {
        this._showFoldout({
          type: FoldoutType.Publish,
        })
        return
      }

      const state = this.getRepositoryState(repository)
      if (state.branchesState.tip.kind === TipState.Unborn) {
        return Promise.reject(new Error('The current branch is unborn.'))
      }

      if (state.branchesState.tip.kind === TipState.Detached) {
        return Promise.reject(new Error('The current repository is in a detached HEAD state.'))
      }

      if (state.branchesState.tip.kind === TipState.Valid) {
        const branch = state.branchesState.tip.branch
        const user = this.getUserForRepository(repository)
        return gitStore.performFailableOperation(() => {
          const setUpstream = branch.upstream ? false : true
          return pushRepo(repository, user, remote.name, branch.name, setUpstream)
            .then(() => this._refreshRepository(repository))
            .then(() => this.fetch(repository))
        })
      }
    })
  }

  private async isCommitting(repository: Repository, fn: () => Promise<boolean>): Promise<boolean | void> {
    const state = this.getRepositoryState(repository)
    // ensure the user doesn't try and commit again
    if (state.isCommitting) { return }

    this.updateRepositoryState(repository, state => ({ isCommitting: true }))
    this.emitUpdate()

    try {
      return await fn()
    } finally {
      this.updateRepositoryState(repository, state => ({ isCommitting: false }))
      this.emitUpdate()
    }
  }

  private async withPushPull(repository: Repository, fn: () => Promise<void>): Promise<void> {
    const state = this.getRepositoryState(repository)
    // Don't allow concurrent network operations.
    if (state.pushPullInProgress) { return }

    this.updateRepositoryState(repository, state => ({ pushPullInProgress: true }))
    this.emitUpdate()

    try {
      await fn()
    } finally {
      this.updateRepositoryState(repository, state => ({ pushPullInProgress: false }))
      this.emitUpdate()
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _pull(repository: Repository): Promise<void> {
    return this.withPushPull(repository, async () => {
      const gitStore = this.getGitStore(repository)
      const remote = gitStore.remote
      if (!remote) {
        return Promise.reject(new Error('The repository has no remotes.'))
      }

      const state = this.getRepositoryState(repository)

      if (state.branchesState.tip.kind === TipState.Unborn) {
        return Promise.reject(new Error('The current branch is unborn.'))
      }

      if (state.branchesState.tip.kind === TipState.Detached) {
        return Promise.reject(new Error('The current repository is in a detached HEAD state.'))
      }

      if (state.branchesState.tip.kind === TipState.Valid) {
        const branch = state.branchesState.tip.branch
        const user = this.getUserForRepository(repository)
        return gitStore.performFailableOperation(() => pullRepo(repository, user, remote.name, branch.name))
          .then(() => this._refreshRepository(repository))
          .then(() => this.fetch(repository))
      }
    })
  }

  private async fastForwardBranches(repository: Repository) {
    const state = this.getRepositoryState(repository)
    const branches = state.branchesState.allBranches

    const tip = state.branchesState.tip
    const currentBranchName = tip.kind === TipState.Valid
      ? tip.branch.name
      : null

    // A branch is only eligible for being fast forwarded if:
    //  1. It's local.
    //  2. It's not the current branch.
    //  3. It has an upstream.
    //  4. It's not ahead of its upstream.
    const eligibleBranches = branches.filter(b => {
      return b.type === BranchType.Local && b.name !== currentBranchName && b.upstream
    })

    for (const branch of eligibleBranches) {
      const aheadBehind = await getBranchAheadBehind(repository, branch)
      if (!aheadBehind) { continue }

      const { ahead, behind } = aheadBehind
      if (ahead === 0 && behind > 0) {
        // At this point we're guaranteed this is non-null since we've filtered
        // out any branches will null upstreams above when creating
        // `eligibleBranches`.
        const upstreamRef = branch.upstream!
        await updateRef(repository, `refs/heads/${branch.name}`, branch.tip.sha, upstreamRef, 'pull: Fast-forward')
      }
    }
  }

  private getUserForRepository(repository: Repository): User | null {
    const gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) { return null }

    return getUserForEndpoint(this.users, gitHubRepository.endpoint)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _publishRepository(repository: Repository, name: string, description: string, private_: boolean, account: User, org: IAPIUser | null): Promise<void> {
    const api = new API(account)
    const apiRepository = await api.createRepository(org, name, description, private_)

    const gitStore = this.getGitStore(repository)
    await gitStore.performFailableOperation(() => addRemote(repository, 'origin', apiRepository.cloneUrl))
    await gitStore.loadCurrentRemote()
    return this._push(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _clone(url: string, path: string, user: User | null): { promise: Promise<boolean>, repository: CloningRepository } {
    const promise = this.cloningRepositoriesStore.clone(url, path, user)
    const repository = this.cloningRepositoriesStore
                           .repositories
                           .find(r => r.url === url && r.path === path) !

    return { promise, repository }
  }

  public _removeCloningRepository(repository: CloningRepository) {
    this.cloningRepositoriesStore.remove(repository)
  }

  public async _discardChanges(repository: Repository, files: ReadonlyArray<WorkingDirectoryFileChange>) {
    const gitStore = this.getGitStore(repository)
    await gitStore.discardChanges(files)

    return this._refreshRepository(repository)
  }

  public async _undoCommit(repository: Repository, commit: Commit): Promise<void> {
    const gitStore = this.getGitStore(repository)

    await gitStore.undoCommit(commit)

    return this._refreshRepository(repository)
  }

  public _clearContextualCommitMessage(repository: Repository): Promise<void> {
    const gitStore = this.getGitStore(repository)
    return gitStore.clearContextualCommitMessage()
  }

  /** Fetch the repository. */
  public async fetch(repository: Repository): Promise<void> {
    await this.withPushPull(repository, async () => {
      const gitStore = this.getGitStore(repository)
      const user = this.getUserForRepository(repository)
      await gitStore.fetch(user)
      await this.fastForwardBranches(repository)
    })

    return this._refreshRepository(repository)
  }

  public _endWelcomeFlow(): Promise<void> {
    this.showWelcomeFlow = false

    this.emitUpdate()

    localStorage.setItem(HasShownWelcomeFlowKey, '1')

    return Promise.resolve()
  }

  public _setSidebarWidth(width: number): Promise<void> {
    this.sidebarWidth = width
    localStorage.setItem(sidebarWidthConfigKey, width.toString())
    this.emitUpdate()

    return Promise.resolve()
  }

  public _resetSidebarWidth(): Promise<void> {
    this.sidebarWidth = defaultSidebarWidth
    localStorage.removeItem(sidebarWidthConfigKey)
    this.emitUpdate()

    return Promise.resolve()
  }

  public _setCommitSummaryWidth(width: number): Promise<void> {
    this.commitSummaryWidth = width
    localStorage.setItem(commitSummaryWidthConfigKey, width.toString())
    this.emitUpdate()

    return Promise.resolve()
  }

  public _resetCommitSummaryWidth(): Promise<void> {
    this.commitSummaryWidth = defaultCommitSummaryWidth
    localStorage.removeItem(commitSummaryWidthConfigKey)
    this.emitUpdate()

    return Promise.resolve()
  }

  public _setCommitMessage(repository: Repository, message: ICommitMessage | null): Promise<void> {
    const gitStore = this.getGitStore(repository)
    return gitStore.setCommitMessage(message)
  }

  /**
   * Set the global application menu.
   *
   * This is called in response to the main process emitting an event signalling
   * that the application menu has changed in some way like an item being
   * added/removed or an item having its visibility toggled.
   *
   * This method should not be called by the renderer in any other circumstance
   * than as a directly result of the main-process event.
   *
   */
  private setAppMenu(menu: IMenu): Promise<void> {
    if (this.appMenu) {
      this.appMenu = this.appMenu.withMenu(menu)
    } else {
      this.appMenu = AppMenu.fromMenu(menu)
    }

    this.emitUpdate()
    return Promise.resolve()
  }

  public _setAppMenuState(update: (appMenu: AppMenu) => AppMenu): Promise<void> {
    if (this.appMenu) {
      this.appMenu = update(this.appMenu)
      this.emitUpdate()
    }
    return Promise.resolve()
  }

  public _setAccessKeyHighlightState(highlight: boolean): Promise<void> {
    if (this.highlightAccessKeys !== highlight) {
      this.highlightAccessKeys = highlight
      this.emitUpdate()
    }

    return Promise.resolve()
  }

  public async _mergeBranch(repository: Repository, branch: string): Promise<void> {
    const gitStore = this.getGitStore(repository)
    await gitStore.merge(branch)

    return this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _setRemoteURL(repository: Repository, name: string, url: string): Promise<void> {
    const gitStore = this.getGitStore(repository)
    return gitStore.setRemoteURL(name, url)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _openShell(path: string) {
    return openShell(path)
  }

  /** Takes a URL and opens it using the system default application */
  public _openInBrowser(url: string) {
    return shell.openExternal(url)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _saveGitIgnore(repository: Repository, text: string): Promise<void> {
    const gitStore = this.getGitStore(repository)
    return gitStore.saveGitIgnore(text)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _readGitIgnore(repository: Repository): Promise<string | null> {
    const gitStore = this.getGitStore(repository)
    return gitStore.readGitIgnore()
  }

  /** Has the user opted out of stats reporting? */
  public getStatsOptOut(): boolean {
    return this.statsStore.getOptOut()
  }

  /** Set whether the user has opted out of stats reporting. */
  public _setStatsOptOut(optOut: boolean): Promise<void> {
    this.statsStore.setOptOut(optOut)

    this.emitUpdate()

    return Promise.resolve()
  }

  public _reportStats() {
    return this.statsStore.reportStats()
  }

  public _recordLaunchStats(stats: ILaunchStats): Promise<void> {
    return this.statsStore.recordLaunchStats(stats)
  }

  public async _ignore(repository: Repository, pattern: string): Promise<void> {
    const gitStore = this.getGitStore(repository)
    await gitStore.ignore(pattern)

    return this._refreshRepository(repository)
  }

  public _resetSignInState(): Promise<void> {
    this.signInStore.reset()
    return Promise.resolve()
  }

  public _beginDotComSignIn(): Promise<void> {
    this.signInStore.beginDotComSignIn()
    return Promise.resolve()
  }

  public _beginEnterpriseSignIn(): Promise<void> {
    this.signInStore.beginEnterpriseSignIn()
    return Promise.resolve()
  }

  public _setSignInEndpoint(url: string): Promise<void> {
    return this.signInStore.setEndpoint(url)
  }

  public _setSignInCredentials(username: string, password: string): Promise<void> {
    return this.signInStore.authenticateWithBasicAuth(username, password)
  }

  public _requestBrowserAuthentication(): Promise<void> {
    return this.signInStore.authenticateWithBrowser()
  }

  public _setSignInOTP(otp: string): Promise<void> {
    return this.signInStore.setTwoFactorOTP(otp)
  }
}
