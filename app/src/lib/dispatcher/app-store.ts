import { Emitter, Disposable } from 'event-kit'
import { ipcRenderer, remote } from 'electron'
import {
  IRepositoryState,
  IHistoryState,
  IAppState,
  RepositorySection,
  IChangesState,
  Popup,
  PopupType,
  Foldout,
  FoldoutType,
  IBranchesState,
  PossibleSelections,
  SelectionType,
  ICheckoutProgress,
  Progress,
} from '../app-state'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import { GitHubRepository } from '../../models/github-repository'
import {
  FileChange,
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { DiffSelection, DiffSelectionType, DiffType } from '../../models/diff'
import { matchGitHubRepository } from '../../lib/repository-matching'
import { API, getAccountForEndpoint, IAPIUser } from '../../lib/api'
import { caseInsensitiveCompare } from '../compare'
import { Branch, BranchType } from '../../models/branch'
import { TipState } from '../../models/tip'
import { Commit } from '../../models/commit'
import {
  CloningRepository,
  CloningRepositoriesStore,
} from './cloning-repositories-store'
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
import { hasShownWelcomeFlow, markWelcomeFlowComplete } from '../welcome'
import { WindowState, getWindowState } from '../window-state'
import { structuralEquals } from '../equality'
import { fatalError } from '../fatal-error'
import { updateMenuState } from '../menu-update'

import {
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
  getDefaultRemote,
  formatAsLocalRef,
} from '../git'

import { openShell } from '../open-shell'
import { AccountsStore } from './accounts-store'
import { RepositoriesStore } from './repositories-store'
import { validatedRepositoryPath } from './validated-repository-path'
import { IGitAccount } from '../git/authentication'
import { getGenericHostname, getGenericUsername } from '../generic-git-auth'
import { RetryActionType, RetryAction } from '../retry-actions'

const LastSelectedRepositoryIDKey = 'last-selected-repository-id'

const defaultSidebarWidth: number = 250
const sidebarWidthConfigKey: string = 'sidebar-width'

const defaultCommitSummaryWidth: number = 250
const commitSummaryWidthConfigKey: string = 'commit-summary-width'

const confirmRepoRemovalDefault: boolean = true
const confirmRepoRemovalKey: string = 'confirmRepoRemoval'

export class AppStore {
  private emitter = new Emitter()

  private accounts: ReadonlyArray<Account> = new Array<Account>()
  private repositories: ReadonlyArray<Repository> = new Array<Repository>()

  private selectedRepository: Repository | CloningRepository | null = null

  /** The background fetcher for the currently selected repository. */
  private currentBackgroundFetcher: BackgroundFetcher | null = null

  private repositoryState = new Map<number, IRepositoryState>()
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
  public get issuesStore(): IssuesStore {
    return this._issuesStore
  }

  /** GitStores keyed by their associated Repository ID. */
  private readonly gitStores = new Map<number, GitStore>()

  private readonly signInStore: SignInStore

  private readonly accountsStore: AccountsStore
  private readonly repositoriesStore: RepositoriesStore

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

  /**
   * A value indicating whether or not the current application
   * window has focus.
   */
  private appIsFocused: boolean = false

  private sidebarWidth: number = defaultSidebarWidth
  private commitSummaryWidth: number = defaultCommitSummaryWidth
  private windowState: WindowState
  private windowZoomFactor: number = 1
  private isUpdateAvailableBannerVisible: boolean = false
  private confirmRepoRemoval: boolean = confirmRepoRemovalDefault

  private readonly statsStore: StatsStore

  /** The function to resolve the current Open in Desktop flow. */
  private resolveOpenInDesktop:
    | ((repository: Repository | null) => void)
    | null = null

  public constructor(
    gitHubUserStore: GitHubUserStore,
    cloningRepositoriesStore: CloningRepositoriesStore,
    emojiStore: EmojiStore,
    issuesStore: IssuesStore,
    statsStore: StatsStore,
    signInStore: SignInStore,
    accountsStore: AccountsStore,
    repositoriesStore: RepositoriesStore
  ) {
    this.gitHubUserStore = gitHubUserStore
    this.cloningRepositoriesStore = cloningRepositoriesStore
    this.emojiStore = emojiStore
    this._issuesStore = issuesStore
    this.statsStore = statsStore
    this.signInStore = signInStore
    this.accountsStore = accountsStore
    this.repositoriesStore = repositoriesStore
    this.showWelcomeFlow = !hasShownWelcomeFlow()

    const window = remote.getCurrentWindow()
    this.windowState = getWindowState(window)

    ipcRenderer.on(
      'window-state-changed',
      (event: Electron.IpcMessageEvent, args: any[]) => {
        this.windowState = getWindowState(window)
        this.emitUpdate()
      }
    )

    window.webContents.getZoomFactor(factor => {
      this.onWindowZoomFactorChanged(factor)
    })

    ipcRenderer.on('zoom-factor-changed', (event: any, zoomFactor: number) => {
      this.onWindowZoomFactorChanged(zoomFactor)
    })

    ipcRenderer.on(
      'app-menu',
      (event: Electron.IpcMessageEvent, { menu }: { menu: IMenu }) => {
        this.setAppMenu(menu)
      }
    )

    getAppMenu()

    this.gitHubUserStore.onDidUpdate(() => {
      this.emitUpdate()
    })

    this.cloningRepositoriesStore.onDidUpdate(() => {
      this.emitUpdate()
    })

    this.cloningRepositoriesStore.onDidError(e => this.emitError(e))

    this.signInStore.onDidAuthenticate(account => this._addAccount(account))
    this.signInStore.onDidUpdate(() => this.emitUpdate())
    this.signInStore.onDidError(error => this.emitError(error))

    accountsStore.onDidUpdate(async () => {
      const accounts = await this.accountsStore.getAll()
      this.accounts = accounts
      this.emitUpdate()
    })

    repositoriesStore.onDidUpdate(async () => {
      const repositories = await this.repositoriesStore.getAll()
      this.repositories = repositories
      this.updateRepositorySelection()
      this.emitUpdate()
    })
  }

  /** Load the emoji from disk. */
  public loadEmoji() {
    const rootDir = getAppPath()
    this.emojiStore.read(rootDir).then(() => this.emitUpdate())
  }

  private emitUpdate() {
    // If the window is hidden then we won't get an animation frame, but there
    // may still be work we wanna do in response to the state change. So
    // immediately emit the update.
    if (this.windowState === 'hidden') {
      this.emitUpdateNow()
      return
    }

    if (this.emitQueued) {
      return
    }

    this.emitQueued = true

    window.requestAnimationFrame(() => {
      this.emitUpdateNow()
    })
  }

  private emitUpdateNow() {
    this.emitQueued = false
    const state = this.getState()

    this.emitter.emit('did-update', state)
    updateMenuState(state, this.appMenu)
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

  /**
   * Called when we have reason to suspect that the zoom factor
   * has changed. Note that this doesn't necessarily mean that it
   * has changed with regards to our internal state which is why
   * we double check before emitting an update.
   */
  private onWindowZoomFactorChanged(zoomFactor: number) {
    const current = this.windowZoomFactor
    this.windowZoomFactor = zoomFactor

    if (zoomFactor !== current) {
      this.emitUpdate()
    }
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
        workingDirectory: new WorkingDirectoryStatus(
          new Array<WorkingDirectoryFileChange>(),
          true
        ),
        selectedFileID: null,
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
      isPushPullFetchInProgress: false,
      isCommitting: false,
      lastFetched: null,
      checkoutProgress: null,
      pushPullFetchProgress: null,
    }
  }

  /** Get the state for the repository. */
  public getRepositoryState(repository: Repository): IRepositoryState {
    let state = this.repositoryState.get(repository.id)
    if (state) {
      const gitHubUsers =
        this.gitHubUserStore.getUsersForRepository(repository) ||
        new Map<string, IGitHubUser>()
      return merge(state, { gitHubUsers })
    }

    state = this.getInitialRepositoryState()
    this.repositoryState.set(repository.id, state)
    return state
  }

  private updateRepositoryState<K extends keyof IRepositoryState>(
    repository: Repository,
    fn: (state: IRepositoryState) => Pick<IRepositoryState, K>
  ) {
    const currentState = this.getRepositoryState(repository)
    const newValues = fn(currentState)
    this.repositoryState.set(repository.id, merge(currentState, newValues))
  }

  private updateHistoryState<K extends keyof IHistoryState>(
    repository: Repository,
    fn: (historyState: IHistoryState) => Pick<IHistoryState, K>
  ) {
    this.updateRepositoryState(repository, state => {
      const historyState = state.historyState
      const newValues = fn(historyState)
      return { historyState: merge(historyState, newValues) }
    })
  }

  private updateChangesState<K extends keyof IChangesState>(
    repository: Repository,
    fn: (changesState: IChangesState) => Pick<IChangesState, K>
  ) {
    this.updateRepositoryState(repository, state => {
      const changesState = state.changesState
      const newState = merge(changesState, fn(changesState))
      return { changesState: newState }
    })
  }

  private updateBranchesState(
    repository: Repository,
    fn: (branchesState: IBranchesState) => IBranchesState
  ) {
    this.updateRepositoryState(repository, state => {
      const branchesState = fn(state.branchesState)
      return { branchesState }
    })
  }

  private getSelectedState(): PossibleSelections | null {
    const repository = this.selectedRepository
    if (!repository) {
      return null
    }

    if (repository instanceof CloningRepository) {
      const progress = this.cloningRepositoriesStore.getRepositoryState(
        repository
      )
      if (!progress) {
        return null
      }

      return {
        type: SelectionType.CloningRepository,
        repository,
        progress,
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
      accounts: this.accounts,
      repositories: [
        ...this.repositories,
        ...this.cloningRepositoriesStore.repositories,
      ],
      windowState: this.windowState,
      windowZoomFactor: this.windowZoomFactor,
      appIsFocused: this.appIsFocused,
      selectedState: this.getSelectedState(),
      signInState: this.signInStore.getState(),
      currentPopup: this.currentPopup,
      currentFoldout: this.currentFoldout,
      errors: this.errors,
      showWelcomeFlow: this.showWelcomeFlow,
      emoji: this.emojiStore.emoji,
      sidebarWidth: this.sidebarWidth,
      commitSummaryWidth: this.commitSummaryWidth,
      appMenuState: this.appMenu ? this.appMenu.openMenus : [],
      titleBarStyle: this.showWelcomeFlow ? 'light' : 'dark',
      highlightAccessKeys: this.highlightAccessKeys,
      isUpdateAvailableBannerVisible: this.isUpdateAvailableBannerVisible,
      confirmRepoRemoval: this.confirmRepoRemoval,
    }
  }

  private onGitStoreUpdated(repository: Repository, gitStore: GitStore) {
    this.updateHistoryState(repository, state => ({
      history: gitStore.history,
    }))

    this.updateBranchesState(repository, state => ({
      tip: gitStore.tip,
      defaultBranch: gitStore.defaultBranch,
      allBranches: gitStore.allBranches,
      recentBranches: gitStore.recentBranches,
    }))

    this.updateChangesState(repository, state => ({
      commitMessage: gitStore.commitMessage,
      contextualCommitMessage: gitStore.contextualCommitMessage,
    }))

    this.updateRepositoryState(repository, state => ({
      commits: gitStore.commits,
      localCommitSHAs: gitStore.localCommitSHAs,
      aheadBehind: gitStore.aheadBehind,
      remote: gitStore.remote,
      lastFetched: gitStore.lastFetched,
    }))

    this.emitUpdate()
  }

  private onGitStoreLoadedCommits(
    repository: Repository,
    commits: ReadonlyArray<Commit>
  ) {
    for (const commit of commits) {
      this.gitHubUserStore._loadAndCacheUser(
        this.accounts,
        repository,
        commit.sha,
        commit.author.email
      )
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
      gitStore.onDidLoadNewCommits(commits =>
        this.onGitStoreLoadedCommits(repository, commits)
      )
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
  public async _loadChangedFilesForCurrentSelection(
    repository: Repository
  ): Promise<void> {
    const state = this.getRepositoryState(repository)
    const selection = state.historyState.selection
    const currentSHA = selection.sha
    if (!currentSHA) {
      return
    }

    const gitStore = this.getGitStore(repository)
    const changedFiles = await gitStore.performFailableOperation(() =>
      getChangedFiles(repository, currentSHA)
    )
    if (!changedFiles) {
      return
    }

    // The selection could have changed between when we started loading the
    // changed files and we finished. We might wanna store the changed files per
    // SHA/path.
    if (currentSHA !== state.historyState.selection.sha) {
      return
    }

    // if we're selecting a commit for the first time, we should select the
    // first file in the commit and render the diff immediately

    const noFileSelected = selection.file === null

    const firstFileOrDefault =
      noFileSelected && changedFiles.length ? changedFiles[0] : selection.file

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
  public async _changeHistoryCommitSelection(
    repository: Repository,
    sha: string
  ): Promise<void> {
    this.updateHistoryState(repository, state => {
      const commitChanged = state.selection.sha !== sha
      const changedFiles = commitChanged
        ? new Array<FileChange>()
        : state.changedFiles
      const file = commitChanged ? null : state.selection.file
      const selection = { sha, file }
      const diff = null

      return { selection, changedFiles, diff }
    })
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeHistoryFileSelection(
    repository: Repository,
    file: FileChange
  ): Promise<void> {
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
        throw new Error(
          "No currently selected sha yet we've been asked to switch file selection"
        )
      } else {
        return
      }
    }

    const diff = await getCommitDiff(repository, file, sha)

    const stateAfterLoad = this.getRepositoryState(repository)

    // A whole bunch of things could have happened since we initiated the diff load
    if (
      stateAfterLoad.historyState.selection.sha !==
      stateBeforeLoad.historyState.selection.sha
    ) {
      return
    }
    if (!stateAfterLoad.historyState.selection.file) {
      return
    }
    if (stateAfterLoad.historyState.selection.file.id !== file.id) {
      return
    }

    this.updateHistoryState(repository, state => {
      const selection = { sha: state.selection.sha, file }
      return { selection, diff }
    })

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _selectRepository(
    repository: Repository | CloningRepository | null
  ): Promise<Repository | null> {
    const previouslySelectedRepository = this.selectedRepository
    this.selectedRepository = repository
    this.emitUpdate()

    this.stopBackgroundFetching()

    if (!repository) {
      return Promise.resolve(null)
    }
    if (!(repository instanceof Repository)) {
      return Promise.resolve(null)
    }

    localStorage.setItem(LastSelectedRepositoryIDKey, repository.id.toString())

    if (repository.missing) {
      // as the repository is no longer found on disk, cleaning this up
      // ensures we don't accidentally run any Git operations against the
      // wrong location if the user then relocates the `.git` folder elsewhere
      this.removeGitStore(repository)
      return Promise.resolve(null)
    }

    const gitHubRepository = repository.gitHubRepository
    if (gitHubRepository) {
      this._updateIssues(gitHubRepository)
    }

    await this._refreshRepository(repository)

    // The selected repository could have changed while we were refreshing.
    if (this.selectedRepository !== repository) {
      return null
    }

    // "Clone in Desktop" from a cold start can trigger this twice, and
    // for edge cases where _selectRepository is re-entract, calling this here
    // ensures we clean up the existing background fetcher correctly (if set)
    this.stopBackgroundFetching()

    this.startBackgroundFetching(repository, !previouslySelectedRepository)
    this.refreshMentionables(repository)

    if (repository instanceof Repository) {
      return this.refreshGitHubRepositoryInfo(repository)
    } else {
      return repository
    }
  }

  public async _updateIssues(repository: GitHubRepository) {
    const user = getAccountForEndpoint(this.accounts, repository.endpoint)
    if (!user) {
      return
    }

    try {
      await this._issuesStore.fetchIssues(repository, user)
    } catch (e) {
      log.warn(`Unable to fetch issues for ${repository.fullName}`, e)
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
    const account = this.getAccountForRepository(repository)
    if (!account) {
      return
    }

    const gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) {
      return
    }

    this.gitHubUserStore.updateMentionables(gitHubRepository, account)
  }

  private startBackgroundFetching(
    repository: Repository,
    withInitialSkew: boolean
  ) {
    if (this.currentBackgroundFetcher) {
      fatalError(
        `We should only have on background fetcher active at once, but we're trying to start background fetching on ${repository.name} while another background fetcher is still active!`
      )
      return
    }

    const account = this.getAccountForRepository(repository)
    if (!account) {
      return
    }

    if (!repository.gitHubRepository) {
      return
    }

    const fetcher = new BackgroundFetcher(repository, account, r =>
      this.performFetch(r, account, true)
    )
    fetcher.start(withInitialSkew)
    this.currentBackgroundFetcher = fetcher
  }

  /** Load the initial state for the app. */
  public async loadInitialState() {
    const [accounts, repositories] = await Promise.all([
      this.accountsStore.getAll(),
      this.repositoriesStore.getAll(),
    ])

    this.accounts = accounts
    this.repositories = repositories

    // doing this that the current user can be found by any of their email addresses
    for (const account of accounts) {
      const userAssociations: ReadonlyArray<
        IGitHubUser
      > = account.emails.map(email =>
        // NB: We're not using object spread here because `account` has more
        // keys than we want.
        ({
          endpoint: account.endpoint,
          email: email.email,
          login: account.login,
          avatarURL: account.avatarURL,
          name: account.name,
        })
      )

      for (const user of userAssociations) {
        this.gitHubUserStore.cacheUser(user)
      }
    }

    this.updateRepositorySelection()

    this.sidebarWidth =
      parseInt(localStorage.getItem(sidebarWidthConfigKey) || '', 10) ||
      defaultSidebarWidth
    this.commitSummaryWidth =
      parseInt(localStorage.getItem(commitSummaryWidthConfigKey) || '', 10) ||
      defaultCommitSummaryWidth

    const confirmRepoRemovalValue = localStorage.getItem(confirmRepoRemovalKey)

    this.confirmRepoRemoval =
      confirmRepoRemovalValue === null
        ? confirmRepoRemovalDefault
        : confirmRepoRemovalValue === '1'

    this.emitUpdateNow()

    this.accountsStore.refresh()
  }

  private updateRepositorySelection() {
    const selectedRepository = this.selectedRepository
    let newSelectedRepository: Repository | CloningRepository | null = this
      .selectedRepository
    if (selectedRepository) {
      const r =
        this.repositories.find(
          r =>
            r.constructor === selectedRepository.constructor &&
            r.id === selectedRepository.id
        ) || null

      newSelectedRepository = r
    }

    if (newSelectedRepository === null && this.repositories.length > 0) {
      const lastSelectedID = parseInt(
        localStorage.getItem(LastSelectedRepositoryIDKey) || '',
        10
      )
      if (lastSelectedID && !isNaN(lastSelectedID)) {
        newSelectedRepository =
          this.repositories.find(r => r.id === lastSelectedID) || null
      }

      if (!newSelectedRepository) {
        newSelectedRepository = this.repositories[0]
      }
    }

    const repositoryChanged =
      (selectedRepository &&
        newSelectedRepository &&
        !structuralEquals(selectedRepository, newSelectedRepository)) ||
      (selectedRepository && !newSelectedRepository) ||
      (!selectedRepository && newSelectedRepository)
    if (repositoryChanged) {
      this._selectRepository(newSelectedRepository)
      this.emitUpdate()
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadStatus(
    repository: Repository,
    clearPartialState: boolean = false
  ): Promise<void> {
    const gitStore = this.getGitStore(repository)
    const status = await gitStore.loadStatus()

    if (!status) {
      return
    }

    this.updateChangesState(repository, state => {
      // Populate a map for all files in the current working directory state
      const filesByID = new Map<string, WorkingDirectoryFileChange>()
      state.workingDirectory.files.forEach(f => filesByID.set(f.id, f))

      // Attempt to preserve the selection state for each file in the new
      // working directory state by looking at the current files
      const mergedFiles = status.workingDirectory.files
        .map(file => {
          const existingFile = filesByID.get(file.id)
          if (existingFile) {
            if (clearPartialState) {
              if (
                existingFile.selection.getSelectionType() ===
                DiffSelectionType.Partial
              ) {
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
      const workingDirectory = new WorkingDirectoryStatus(
        mergedFiles,
        includeAll
      )

      let selectedFileID = state.selectedFileID
      const matchedFile = mergedFiles.find(x => x.id === selectedFileID)

      // Select the first file if we don't have anything selected.
      if ((!selectedFileID || !matchedFile) && mergedFiles.length) {
        selectedFileID = mergedFiles[0].id || null
      }

      // The file selection could have changed if the previously selected file
      // is no longer selectable (it was reverted or committed) but if it hasn't
      // changed we can reuse the diff.
      const sameSelectedFileExists = state.selectedFileID
        ? workingDirectory.findFileWithID(state.selectedFileID)
        : null
      const diff = sameSelectedFileExists ? state.diff : null
      return { workingDirectory, selectedFileID, diff }
    })
    this.emitUpdate()

    this.updateChangesDiffForCurrentSelection(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeRepositorySection(
    repository: Repository,
    selectedSection: RepositorySection
  ): Promise<void> {
    this.updateRepositoryState(repository, state => ({ selectedSection }))
    this.emitUpdate()

    if (selectedSection === RepositorySection.History) {
      return this.refreshHistorySection(repository)
    } else if (selectedSection === RepositorySection.Changes) {
      return this.refreshChangesSection(repository, {
        includingStatus: true,
        clearPartialState: false,
      })
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeChangesSelection(
    repository: Repository,
    selectedFile: WorkingDirectoryFileChange | null
  ): Promise<void> {
    this.updateChangesState(repository, state => ({
      selectedFileID: selectedFile ? selectedFile.id : null,
      diff: null,
    }))
    this.emitUpdate()

    this.updateChangesDiffForCurrentSelection(repository)
  }

  /**
   * Loads or re-loads (refreshes) the diff for the currently selected file
   * in the working directory. This operation is a noop if there's no currently
   * selected file.
   */
  private async updateChangesDiffForCurrentSelection(
    repository: Repository
  ): Promise<void> {
    const stateBeforeLoad = this.getRepositoryState(repository)
    const changesStateBeforeLoad = stateBeforeLoad.changesState
    const selectedFileIDBeforeLoad = changesStateBeforeLoad.selectedFileID
    if (!selectedFileIDBeforeLoad) {
      return
    }

    const selectedFileBeforeLoad = changesStateBeforeLoad.workingDirectory.findFileWithID(
      selectedFileIDBeforeLoad
    )
    if (!selectedFileBeforeLoad) {
      return
    }

    const diff = await getWorkingDirectoryDiff(
      repository,
      selectedFileBeforeLoad
    )

    const stateAfterLoad = this.getRepositoryState(repository)
    const changesState = stateAfterLoad.changesState
    const selectedFileID = changesState.selectedFileID

    // A different file could have been selected while we were loading the diff
    // in which case we no longer care about the diff we just loaded.
    if (!selectedFileID) {
      return
    }
    if (selectedFileID !== selectedFileIDBeforeLoad) {
      return
    }

    const currentlySelectedFile = changesState.workingDirectory.findFileWithID(
      selectedFileID
    )
    if (!currentlySelectedFile) {
      return
    }

    const selectableLines = new Set<number>()
    if (diff.kind === DiffType.Text) {
      // The diff might have changed dramatically since last we loaded it.
      // Ideally we would be more clever about validating that any partial
      // selection state is still valid by ensuring that selected lines still
      // exist but for now we'll settle on just updating the selectable lines
      // such that any previously selected line which now no longer exists or
      // has been turned into a context line isn't still selected.
      diff.hunks.forEach(h => {
        h.lines.forEach((line, index) => {
          if (line.isIncludeableLine()) {
            selectableLines.add(h.unifiedDiffStart + index)
          }
        })
      })
    }

    const newSelection = currentlySelectedFile.selection.withSelectableLines(
      selectableLines
    )
    const selectedFile = currentlySelectedFile.withSelection(newSelection)
    const workingDirectory = changesState.workingDirectory.byReplacingFile(
      selectedFile
    )

    this.updateChangesState(repository, state => ({ diff, workingDirectory }))
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _commitIncludedChanges(
    repository: Repository,
    message: ICommitMessage
  ): Promise<boolean> {
    const state = this.getRepositoryState(repository)
    const files = state.changesState.workingDirectory.files
    const selectedFiles = files.filter(file => {
      return file.selection.getSelectionType() !== DiffSelectionType.None
    })

    const gitStore = this.getGitStore(repository)

    const result = await this.isCommitting(repository, () => {
      return gitStore.performFailableOperation(() => {
        const commitMessage = formatCommitMessage(message)
        return createCommit(repository, commitMessage, selectedFiles)
      })
    })

    if (result) {
      this.statsStore.recordCommit()

      const includedPartialSelections = files.some(
        file => file.selection.getSelectionType() === DiffSelectionType.Partial
      )
      if (includedPartialSelections) {
        this.statsStore.recordPartialCommit()
      }

      await this._refreshRepository(repository)
      await this.refreshChangesSection(repository, {
        includingStatus: true,
        clearPartialState: true,
      })
    }

    return result || false
  }

  private getIncludeAllState(
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): boolean | null {
    const allSelected = files.every(
      f => f.selection.getSelectionType() === DiffSelectionType.All
    )
    const noneSelected = files.every(
      f => f.selection.getSelectionType() === DiffSelectionType.None
    )

    let includeAll: boolean | null = null
    if (allSelected) {
      includeAll = true
    } else if (noneSelected) {
      includeAll = false
    }

    return includeAll
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeFileIncluded(
    repository: Repository,
    file: WorkingDirectoryFileChange,
    include: boolean
  ): Promise<void> {
    const selection = include
      ? file.selection.withSelectAll()
      : file.selection.withSelectNone()
    this.updateWorkingDirectoryFileSelection(repository, file, selection)
    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeFileLineSelection(
    repository: Repository,
    file: WorkingDirectoryFileChange,
    diffSelection: DiffSelection
  ): Promise<void> {
    this.updateWorkingDirectoryFileSelection(repository, file, diffSelection)
    return Promise.resolve()
  }

  /**
   * Updates the selection for the given file in the working directory state and
   * emits an update event.
   */
  private updateWorkingDirectoryFileSelection(
    repository: Repository,
    file: WorkingDirectoryFileChange,
    selection: DiffSelection
  ) {
    this.updateChangesState(repository, state => {
      const newFiles = state.workingDirectory.files.map(
        f => (f.id === file.id ? f.withSelection(selection) : f)
      )

      const includeAll = this.getIncludeAllState(newFiles)
      const workingDirectory = new WorkingDirectoryStatus(newFiles, includeAll)
      const diff = state.selectedFileID ? state.diff : null
      return { workingDirectory, diff }
    })

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeIncludeAllFiles(
    repository: Repository,
    includeAll: boolean
  ): Promise<void> {
    this.updateChangesState(repository, state => {
      const workingDirectory = state.workingDirectory.withIncludeAllFiles(
        includeAll
      )
      return { workingDirectory }
    })

    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _refreshRepository(repository: Repository): Promise<void> {
    if (repository.missing) {
      return
    }

    const state = this.getRepositoryState(repository)
    const gitStore = this.getGitStore(repository)

    // When refreshing we *always* check the status so that we can update the
    // changes indicator in the tab bar. But we only load History if it's
    // selected.
    await Promise.all([this._loadStatus(repository), gitStore.loadBranches()])

    const section = state.selectedSection
    let refreshSectionPromise: Promise<void>
    if (section === RepositorySection.History) {
      refreshSectionPromise = this.refreshHistorySection(repository)
    } else if (section === RepositorySection.Changes) {
      refreshSectionPromise = this.refreshChangesSection(repository, {
        includingStatus: false,
        clearPartialState: false,
      })
    } else {
      return assertNever(section, `Unknown section: ${section}`)
    }

    await Promise.all([
      gitStore.loadCurrentRemote(),
      gitStore.updateLastFetched(),
      this.refreshAuthor(repository),
      gitStore.loadContextualCommitMessage(),
      refreshSectionPromise,
    ])
  }

  /**
   * Refresh all the data for the Changes section.
   *
   * This will be called automatically when appropriate.
   */
  private async refreshChangesSection(
    repository: Repository,
    options: { includingStatus: boolean; clearPartialState: boolean }
  ): Promise<void> {
    if (options.includingStatus) {
      await this._loadStatus(repository, options.clearPartialState)
    }

    const gitStore = this.getGitStore(repository)
    const state = this.getRepositoryState(repository)

    if (state.branchesState.tip.kind === TipState.Valid) {
      const currentBranch = state.branchesState.tip.branch
      await gitStore.loadLocalCommits(currentBranch)
    } else if (state.branchesState.tip.kind === TipState.Unborn) {
      await gitStore.loadLocalCommits(null)
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
    const commitAuthor =
      (await gitStore.performFailableOperation(() =>
        getAuthorIdentity(repository)
      )) || null

    this.updateRepositoryState(repository, state => ({ commitAuthor }))
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _showPopup(popup: Popup): Promise<void> {
    this._closePopup()

    // Always close the app menu when showing a pop up. This is only
    // applicable on Windows where we draw a custom app menu.
    this._closeFoldout(FoldoutType.AppMenu)

    this.currentPopup = popup
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _closePopup(): Promise<void> {
    const currentPopup = this.currentPopup
    if (!currentPopup) {
      return Promise.resolve()
    }

    if (currentPopup.type === PopupType.CloneRepository) {
      this._completeOpenInDesktop(() => Promise.resolve(null))
    }

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
  public async _closeFoldout(foldout: FoldoutType): Promise<void> {
    if (!this.currentFoldout) {
      return
    }

    if (foldout !== undefined && this.currentFoldout.type !== foldout) {
      return
    }

    this.currentFoldout = null
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _createBranch(
    repository: Repository,
    name: string,
    startPoint?: string
  ): Promise<Repository> {
    const gitStore = this.getGitStore(repository)
    const createResult = await gitStore.performFailableOperation(() =>
      createBranch(repository, name, startPoint)
    )

    if (createResult !== true) {
      return repository
    }

    return await this._checkoutBranch(repository, name)
  }

  private updateCheckoutProgress(
    repository: Repository,
    checkoutProgress: ICheckoutProgress | null
  ) {
    this.updateRepositoryState(repository, state => ({ checkoutProgress }))

    if (this.selectedRepository === repository) {
      this.emitUpdate()
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _checkoutBranch(
    repository: Repository,
    name: string
  ): Promise<Repository> {
    const gitStore = this.getGitStore(repository)
    const kind = 'checkout'

    await gitStore.performFailableOperation(() => {
      return checkoutBranch(repository, name, progress => {
        this.updateCheckoutProgress(repository, progress)
      })
    })

    try {
      this.updateCheckoutProgress(repository, {
        kind,
        title: __DARWIN__ ? 'Refreshing Repository' : 'Refreshing repository',
        value: 1,
        targetBranch: name,
      })

      await this._refreshRepository(repository)
    } finally {
      this.updateCheckoutProgress(repository, null)
    }

    return repository
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _repositoryWithRefreshedGitHubRepository(
    repository: Repository
  ): Promise<Repository> {
    const oldGitHubRepository = repository.gitHubRepository

    const updatedRepository = await this.updateGitHubRepositoryAssociation(
      repository
    )

    const updatedGitHubRepository = updatedRepository.gitHubRepository

    if (!updatedGitHubRepository) {
      return updatedRepository
    }

    const account = this.getAccountForRepository(updatedRepository)
    if (!account) {
      // If the repository given to us had a GitHubRepository instance we want
      // to try to preserve that if possible since the updated GitHubRepository
      // instance won't have any API information while the previous one might.
      // We'll only swap it out if the endpoint has changed in which case the
      // old API information will be invalid anyway.
      if (!oldGitHubRepository) {
        return updatedRepository
      }

      // The endpoints have changed, all bets are off
      if (updatedGitHubRepository.endpoint !== oldGitHubRepository.endpoint) {
        return updatedRepository
      }

      return repository
    }

    const api = API.fromAccount(account)
    const apiRepo = await api.fetchRepository(
      updatedGitHubRepository.owner.login,
      updatedGitHubRepository.name
    )

    if (!apiRepo) {
      // If we've failed to retrieve the repository information from the API
      // we generally want to keep whatever information we used to have from
      // a previously successful API request rather than return the
      // updatedRepository which only contains a subset of the fields we'd get
      // from the API. The only circumstance where we would want to return the
      // updated repository is if we previously didn't have an association and
      // have now been able to infer one based on the remote.
      //
      // Note that the updateGitHubRepositoryAssociation method will either
      // return exact repository given if no association could be found or
      // a copy of the given repository with only the gitHubRepository property
      // changed.
      return oldGitHubRepository ? repository : updatedRepository
    }

    const withUpdatedGitHubRepository = updatedRepository.withGitHubRepository(
      updatedGitHubRepository.withAPI(apiRepo)
    )
    if (structuralEquals(withUpdatedGitHubRepository, repository)) {
      return withUpdatedGitHubRepository
    }

    return this.repositoriesStore.updateGitHubRepository(
      withUpdatedGitHubRepository
    )
  }

  private async updateGitHubRepositoryAssociation(
    repository: Repository
  ): Promise<Repository> {
    const gitHubRepository = await this.guessGitHubRepository(repository)
    if (gitHubRepository === repository.gitHubRepository || !gitHubRepository) {
      return repository
    }

    if (
      repository.gitHubRepository &&
      gitHubRepository &&
      structuralEquals(repository.gitHubRepository, gitHubRepository)
    ) {
      return repository
    }

    return repository.withGitHubRepository(gitHubRepository)
  }

  private async guessGitHubRepository(
    repository: Repository
  ): Promise<GitHubRepository | null> {
    const remote = await getDefaultRemote(repository)
    return remote ? matchGitHubRepository(this.accounts, remote.url) : null
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
  public async _renameBranch(
    repository: Repository,
    branch: Branch,
    newName: string
  ): Promise<void> {
    const gitStore = this.getGitStore(repository)
    await gitStore.performFailableOperation(() =>
      renameBranch(repository, branch, newName)
    )

    return this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _deleteBranch(repository: Repository, branch: Branch): Promise<void> {
    return this.withAuthenticatingUser(
      repository,
      async (repository, account) => {
        const defaultBranch = this.getRepositoryState(repository).branchesState
          .defaultBranch
        if (!defaultBranch) {
          throw new Error(`No default branch!`)
        }

        const gitStore = this.getGitStore(repository)

        await gitStore.performFailableOperation(() =>
          checkoutBranch(repository, defaultBranch.name)
        )
        await gitStore.performFailableOperation(() =>
          deleteBranch(repository, branch, account)
        )

        return this._refreshRepository(repository)
      }
    )
  }

  private updatePushPullFetchProgress(
    repository: Repository,
    pushPullFetchProgress: Progress | null
  ) {
    this.updateRepositoryState(repository, state => ({ pushPullFetchProgress }))

    if (this.selectedRepository === repository) {
      this.emitUpdate()
    }
  }

  public async _push(repository: Repository): Promise<void> {
    return this.withAuthenticatingUser(repository, (repository, account) => {
      return this.performPush(repository, account)
    })
  }

  private async performPush(
    repository: Repository,
    account: IGitAccount | null
  ): Promise<void> {
    const gitStore = this.getGitStore(repository)
    const remote = gitStore.remote
    if (!remote) {
      this._showPopup({ type: PopupType.PublishRepository, repository })
      return
    }

    return this.withPushPull(repository, async () => {
      const state = this.getRepositoryState(repository)
      if (state.branchesState.tip.kind === TipState.Unborn) {
        throw new Error('The current branch is unborn.')
      }

      if (state.branchesState.tip.kind === TipState.Detached) {
        throw new Error('The current repository is in a detached HEAD state.')
      }

      if (state.branchesState.tip.kind === TipState.Valid) {
        const branch = state.branchesState.tip.branch

        const pushTitle = `Pushing to ${remote.name}`

        // Emit an initial progress even before our push begins
        // since we're doing some work to get remotes up front.
        this.updatePushPullFetchProgress(repository, {
          kind: 'push',
          title: pushTitle,
          value: 0,
          remote: remote.name,
          branch: branch.name,
        })

        // Let's say that a push takes roughly twice as long as a fetch,
        // this is of course highly inaccurate.
        let pushWeight = 2.5
        let fetchWeight = 1

        // Let's leave 10% at the end for refreshing
        const refreshWeight = 0.1

        // Scale pull and fetch weights to be between 0 and 0.9.
        const scale = 1 / (pushWeight + fetchWeight) * (1 - refreshWeight)

        pushWeight *= scale
        fetchWeight *= scale

        const retryAction: RetryAction = {
          type: RetryActionType.Push,
          repository,
        }
        await gitStore.performFailableOperation(
          async () => {
            await pushRepo(
              repository,
              account,
              remote.name,
              branch.name,
              branch.upstreamWithoutRemote,
              progress => {
                this.updatePushPullFetchProgress(repository, {
                  ...progress,
                  title: pushTitle,
                  value: pushWeight * progress.value,
                })
              }
            )

            await gitStore.fetchRemotes(
              account,
              [remote],
              false,
              fetchProgress => {
                this.updatePushPullFetchProgress(repository, {
                  ...fetchProgress,
                  value: pushWeight + fetchProgress.value * fetchWeight,
                })
              }
            )

            const refreshTitle = __DARWIN__
              ? 'Refreshing Repository'
              : 'Refreshing repository'
            const refreshStartProgress = pushWeight + fetchWeight

            this.updatePushPullFetchProgress(repository, {
              kind: 'generic',
              title: refreshTitle,
              value: refreshStartProgress,
            })

            await this._refreshRepository(repository)

            this.updatePushPullFetchProgress(repository, {
              kind: 'generic',
              title: refreshTitle,
              description: 'Fast-forwarding branches',
              value: refreshStartProgress + refreshWeight * 0.5,
            })

            await this.fastForwardBranches(repository)
          },
          { retryAction }
        )

        this.updatePushPullFetchProgress(repository, null)
      }
    })
  }

  private async isCommitting(
    repository: Repository,
    fn: () => Promise<boolean | undefined>
  ): Promise<boolean | undefined> {
    const state = this.getRepositoryState(repository)
    // ensure the user doesn't try and commit again
    if (state.isCommitting) {
      return
    }

    this.updateRepositoryState(repository, state => ({ isCommitting: true }))
    this.emitUpdate()

    try {
      return await fn()
    } finally {
      this.updateRepositoryState(repository, state => ({ isCommitting: false }))
      this.emitUpdate()
    }
  }

  private async withPushPull(
    repository: Repository,
    fn: () => Promise<void>
  ): Promise<void> {
    const state = this.getRepositoryState(repository)
    // Don't allow concurrent network operations.
    if (state.isPushPullFetchInProgress) {
      return
    }

    this.updateRepositoryState(repository, state => ({
      isPushPullFetchInProgress: true,
    }))
    this.emitUpdate()

    try {
      await fn()
    } finally {
      this.updateRepositoryState(repository, state => ({
        isPushPullFetchInProgress: false,
      }))
      this.emitUpdate()
    }
  }

  public async _pull(repository: Repository): Promise<void> {
    return this.withAuthenticatingUser(repository, (repository, account) => {
      return this.performPull(repository, account)
    })
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  private async performPull(
    repository: Repository,
    account: IGitAccount | null
  ): Promise<void> {
    return this.withPushPull(repository, async () => {
      const gitStore = this.getGitStore(repository)
      const remote = gitStore.remote

      if (!remote) {
        return Promise.reject(new Error('The repository has no remotes.'))
      }

      const state = this.getRepositoryState(repository)

      if (state.branchesState.tip.kind === TipState.Unborn) {
        throw new Error('The current branch is unborn.')
      }

      if (state.branchesState.tip.kind === TipState.Detached) {
        throw new Error('The current repository is in a detached HEAD state.')
      }

      if (state.branchesState.tip.kind === TipState.Valid) {
        const title = `Pulling ${remote.name}`
        const kind = 'pull'
        this.updatePushPullFetchProgress(repository, {
          kind,
          title,
          value: 0,
          remote: remote.name,
        })

        try {
          // Let's say that a pull takes twice as long as a fetch,
          // this is of course highly inaccurate.
          let pullWeight = 2
          let fetchWeight = 1

          // Let's leave 10% at the end for refreshing
          const refreshWeight = 0.1

          // Scale pull and fetch weights to be between 0 and 0.9.
          const scale = 1 / (pullWeight + fetchWeight) * (1 - refreshWeight)

          pullWeight *= scale
          fetchWeight *= scale

          const retryAction: RetryAction = {
            type: RetryActionType.Pull,
            repository,
          }
          await gitStore.performFailableOperation(
            () =>
              pullRepo(repository, account, remote.name, progress => {
                this.updatePushPullFetchProgress(repository, {
                  ...progress,
                  value: progress.value * pullWeight,
                })
              }),
            { retryAction }
          )

          const refreshStartProgress = pullWeight + fetchWeight
          const refreshTitle = __DARWIN__
            ? 'Refreshing Repository'
            : 'Refreshing repository'

          this.updatePushPullFetchProgress(repository, {
            kind: 'generic',
            title: refreshTitle,
            value: refreshStartProgress,
          })

          await this._refreshRepository(repository)

          this.updatePushPullFetchProgress(repository, {
            kind: 'generic',
            title: refreshTitle,
            description: 'Fast-forwarding branches',
            value: refreshStartProgress + refreshWeight * 0.5,
          })

          await this.fastForwardBranches(repository)
        } finally {
          this.updatePushPullFetchProgress(repository, null)
        }
      }
    })
  }

  private async fastForwardBranches(repository: Repository) {
    const state = this.getRepositoryState(repository)
    const branches = state.branchesState.allBranches

    const tip = state.branchesState.tip
    const currentBranchName =
      tip.kind === TipState.Valid ? tip.branch.name : null

    // A branch is only eligible for being fast forwarded if:
    //  1. It's local.
    //  2. It's not the current branch.
    //  3. It has an upstream.
    //  4. It's not ahead of its upstream.
    const eligibleBranches = branches.filter(b => {
      return (
        b.type === BranchType.Local &&
        b.name !== currentBranchName &&
        b.upstream
      )
    })

    for (const branch of eligibleBranches) {
      const aheadBehind = await getBranchAheadBehind(repository, branch)
      if (!aheadBehind) {
        continue
      }

      const { ahead, behind } = aheadBehind
      if (ahead === 0 && behind > 0) {
        // At this point we're guaranteed this is non-null since we've filtered
        // out any branches will null upstreams above when creating
        // `eligibleBranches`.
        const upstreamRef = branch.upstream!
        const localRef = formatAsLocalRef(branch.name)
        await updateRef(
          repository,
          localRef,
          branch.tip.sha,
          upstreamRef,
          'pull: Fast-forward'
        )
      }
    }
  }

  /** Get the authenticated user for the repository. */
  private getAccountForRepository(repository: Repository): Account | null {
    const gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) {
      return null
    }

    return getAccountForEndpoint(this.accounts, gitHubRepository.endpoint)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _publishRepository(
    repository: Repository,
    name: string,
    description: string,
    private_: boolean,
    account: Account,
    org: IAPIUser | null
  ): Promise<Repository> {
    const api = API.fromAccount(account)
    const apiRepository = await api.createRepository(
      org,
      name,
      description,
      private_
    )

    const gitStore = this.getGitStore(repository)
    await gitStore.performFailableOperation(() =>
      addRemote(repository, 'origin', apiRepository.clone_url)
    )
    await gitStore.loadCurrentRemote()

    // skip pushing if the current branch is a detached HEAD or the repository
    // is unborn
    if (gitStore.tip.kind === TipState.Valid) {
      await this.performPush(repository, account)
    }

    return this.refreshGitHubRepositoryInfo(repository)
  }

  private getAccountForRemoteURL(remote: string): IGitAccount | null {
    const gitHubRepository = matchGitHubRepository(this.accounts, remote)
    if (gitHubRepository) {
      const account = getAccountForEndpoint(
        this.accounts,
        gitHubRepository.endpoint
      )
      if (account) {
        return account
      }
    }

    const hostname = getGenericHostname(remote)
    const username = getGenericUsername(hostname)
    if (username != null) {
      return { login: username, endpoint: hostname }
    }

    return null
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _clone(
    url: string,
    path: string,
    options?: { branch?: string }
  ): { promise: Promise<boolean>; repository: CloningRepository } {
    const account = this.getAccountForRemoteURL(url)
    const promise = this.cloningRepositoriesStore.clone(url, path, {
      ...options,
      account,
    })
    const repository = this.cloningRepositoriesStore.repositories.find(
      r => r.url === url && r.path === path
    )!

    return { promise, repository }
  }

  public _removeCloningRepository(repository: CloningRepository) {
    this.cloningRepositoriesStore.remove(repository)
  }

  public async _discardChanges(
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ) {
    const gitStore = this.getGitStore(repository)
    await gitStore.discardChanges(files)

    return this._refreshRepository(repository)
  }

  public async _undoCommit(
    repository: Repository,
    commit: Commit
  ): Promise<void> {
    const gitStore = this.getGitStore(repository)

    await gitStore.undoCommit(commit)

    const state = this.getRepositoryState(repository)
    const selectedCommit = state.historyState.selection.sha

    if (selectedCommit === commit.sha) {
      // clear the selection of this commit in the history view
      this.updateHistoryState(repository, state => {
        const selection = { sha: null, file: null }
        return { selection }
      })
    }

    return this._refreshRepository(repository)
  }

  /**
   * Fetch a specific refspec for the repository.
   *
   * As this action is required to complete when viewing a Pull Request from
   * a fork, it does not opt-in to checks that prevent multiple concurrent
   * network actions. This might require some rework in the future to chain
   * these actions.
   *
   */
  public async _fetchRefspec(
    repository: Repository,
    refspec: string
  ): Promise<void> {
    return this.withAuthenticatingUser(
      repository,
      async (repository, account) => {
        const gitStore = this.getGitStore(repository)
        await gitStore.fetchRefspec(account, refspec)

        return this._refreshRepository(repository)
      }
    )
  }

  /** Fetch the repository. */
  public _fetch(repository: Repository): Promise<void> {
    return this.withAuthenticatingUser(repository, (repository, account) => {
      return this.performFetch(repository, account, false)
    })
  }

  private async performFetch(
    repository: Repository,
    account: IGitAccount | null,
    backgroundTask: boolean
  ): Promise<void> {
    await this.withPushPull(repository, async () => {
      const gitStore = this.getGitStore(repository)

      try {
        const fetchWeight = 0.9
        const refreshWeight = 0.1

        await gitStore.fetch(account, backgroundTask, progress => {
          this.updatePushPullFetchProgress(repository, {
            ...progress,
            value: progress.value * fetchWeight,
          })
        })

        const refreshTitle = __DARWIN__
          ? 'Refreshing Repository'
          : 'Refreshing repository'

        this.updatePushPullFetchProgress(repository, {
          kind: 'generic',
          title: refreshTitle,
          value: fetchWeight,
        })

        await this._refreshRepository(repository)

        this.updatePushPullFetchProgress(repository, {
          kind: 'generic',
          title: refreshTitle,
          description: 'Fast-forwarding branches',
          value: fetchWeight + refreshWeight * 0.5,
        })

        await this.fastForwardBranches(repository)
      } finally {
        this.updatePushPullFetchProgress(repository, null)
      }
    })
  }

  public _endWelcomeFlow(): Promise<void> {
    this.showWelcomeFlow = false

    this.emitUpdate()

    markWelcomeFlowComplete()

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

  public _setCommitMessage(
    repository: Repository,
    message: ICommitMessage | null
  ): Promise<void> {
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

  public _setAppMenuState(
    update: (appMenu: AppMenu) => AppMenu
  ): Promise<void> {
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

  public async _mergeBranch(
    repository: Repository,
    branch: string
  ): Promise<void> {
    const gitStore = this.getGitStore(repository)
    await gitStore.merge(branch)

    return this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _setRemoteURL(
    repository: Repository,
    name: string,
    url: string
  ): Promise<void> {
    const gitStore = this.getGitStore(repository)
    return gitStore.setRemoteURL(name, url)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _openShell(path: string) {
    this.statsStore.recordOpenShell()

    return openShell(path)
  }

  /** Takes a URL and opens it using the system default application */
  public _openInBrowser(url: string): Promise<boolean> {
    return shell.openExternal(url)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _saveGitIgnore(
    repository: Repository,
    text: string
  ): Promise<void> {
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
  public async setStatsOptOut(optOut: boolean): Promise<void> {
    await this.statsStore.setOptOut(optOut)

    this.emitUpdate()
  }

  public _setConfirmRepoRemoval(confirmRepoRemoval: boolean): Promise<void> {
    this.confirmRepoRemoval = confirmRepoRemoval
    localStorage.setItem(confirmRepoRemovalKey, confirmRepoRemoval ? '1' : '0')
    this.emitUpdate()

    return Promise.resolve()
  }

  public _setUpdateBannerVisibility(visibility: boolean) {
    this.isUpdateAvailableBannerVisible = visibility

    this.emitUpdate()
  }

  public _reportStats() {
    return this.statsStore.reportStats(this.accounts, this.repositories)
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

  public _setSignInCredentials(
    username: string,
    password: string
  ): Promise<void> {
    return this.signInStore.authenticateWithBasicAuth(username, password)
  }

  public _requestBrowserAuthentication(): Promise<void> {
    return this.signInStore.authenticateWithBrowser()
  }

  public _setSignInOTP(otp: string): Promise<void> {
    return this.signInStore.setTwoFactorOTP(otp)
  }

  public _setAppFocusState(isFocused: boolean): Promise<void> {
    const changed = this.appIsFocused !== isFocused
    this.appIsFocused = isFocused

    if (changed) {
      this.emitUpdate()
    }

    return Promise.resolve()
  }

  /**
   * Start an Open in Desktop flow. This will return a new promise which will
   * resolve when `_completeOpenInDesktop` is called.
   */
  public _startOpenInDesktop(fn: () => void): Promise<Repository | null> {
    // tslint:disable-next-line:promise-must-complete
    const p = new Promise<Repository | null>(
      resolve => (this.resolveOpenInDesktop = resolve)
    )
    fn()
    return p
  }

  /**
   * Complete any active Open in Desktop flow with the repository returned by
   * the given function.
   */
  public async _completeOpenInDesktop(
    fn: () => Promise<Repository | null>
  ): Promise<Repository | null> {
    const resolve = this.resolveOpenInDesktop
    this.resolveOpenInDesktop = null

    const result = await fn()
    if (resolve) {
      resolve(result)
    }

    return result
  }

  public _updateRepositoryPath(
    repository: Repository,
    path: string
  ): Promise<Repository> {
    return this.repositoriesStore.updateRepositoryPath(repository, path)
  }

  public _removeAccount(account: Account): Promise<void> {
    return this.accountsStore.removeAccount(account)
  }

  public _addAccount(account: Account): Promise<void> {
    return this.accountsStore.addAccount(account)
  }

  public _updateRepositoryMissing(
    repository: Repository,
    missing: boolean
  ): Promise<Repository> {
    return this.repositoriesStore.updateRepositoryMissing(repository, missing)
  }

  public async _addRepositories(
    paths: ReadonlyArray<string>
  ): Promise<ReadonlyArray<Repository>> {
    const addedRepositories = new Array<Repository>()
    for (const path of paths) {
      const validatedPath = await validatedRepositoryPath(path)
      if (validatedPath) {
        const addedRepo = await this.repositoriesStore.addRepository(
          validatedPath
        )
        const refreshedRepo = await this.refreshGitHubRepositoryInfo(addedRepo)
        addedRepositories.push(refreshedRepo)
      } else {
        const error = new Error(`${path} isn't a git repository.`)
        this.emitError(error)
      }
    }

    return addedRepositories
  }

  public async _removeRepositories(
    repositories: ReadonlyArray<Repository | CloningRepository>
  ): Promise<void> {
    const localRepositories = repositories.filter(
      r => r instanceof Repository
    ) as ReadonlyArray<Repository>
    const cloningRepositories = repositories.filter(
      r => r instanceof CloningRepository
    ) as ReadonlyArray<CloningRepository>
    cloningRepositories.forEach(r => {
      this._removeCloningRepository(r)
    })

    const repositoryIDs = localRepositories.map(r => r.id)
    for (const id of repositoryIDs) {
      await this.repositoriesStore.removeRepository(id)
    }

    this._showFoldout({ type: FoldoutType.Repository })
  }

  private async refreshGitHubRepositoryInfo(
    repository: Repository
  ): Promise<Repository> {
    const refreshedRepository = await this._repositoryWithRefreshedGitHubRepository(
      repository
    )

    if (structuralEquals(refreshedRepository, repository)) {
      return refreshedRepository
    }

    return this.repositoriesStore.updateGitHubRepository(refreshedRepository)
  }

  public async _cloneAgain(url: string, path: string): Promise<void> {
    const { promise, repository } = this._clone(url, path)
    await this._selectRepository(repository)
    const success = await promise
    if (!success) {
      return
    }

    const repositories = this.repositories
    const found = repositories.find(r => r.path === path)

    if (found) {
      const updatedRepository = await this._updateRepositoryMissing(
        found,
        false
      )
      await this._selectRepository(updatedRepository)
    }
  }

  private async withAuthenticatingUser<T>(
    repository: Repository,
    fn: (repository: Repository, account: IGitAccount | null) => Promise<T>
  ): Promise<T> {
    let updatedRepository = repository
    let account: IGitAccount | null = this.getAccountForRepository(
      updatedRepository
    )

    // If we don't have a user association, it might be because we haven't yet
    // tried to associate the repository with a GitHub repository, or that
    // association is out of date. So try again before we bail on providing an
    // authenticating user.
    if (!account) {
      updatedRepository = await this.refreshGitHubRepositoryInfo(repository)
      account = this.getAccountForRepository(updatedRepository)
    }

    if (!account) {
      const gitStore = this.getGitStore(repository)
      const remote = gitStore.remote
      if (remote) {
        const hostname = getGenericHostname(remote.url)
        const username = getGenericUsername(hostname)
        if (username != null) {
          account = { login: username, endpoint: hostname }
        }
      }
    }

    return fn(updatedRepository, account)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _revertCommit(
    repository: Repository,
    commit: Commit
  ): Promise<void> {
    const gitStore = this.getGitStore(repository)

    gitStore.revertCommit(repository, commit)
  }

  public async promptForGenericGitAuthentication(
    repository: Repository | CloningRepository,
    retryAction: RetryAction
  ): Promise<void> {
    let url
    if (repository instanceof Repository) {
      const gitStore = this.getGitStore(repository)
      const remote = gitStore.remote
      if (!remote) {
        return
      }

      url = remote.url
    } else {
      url = repository.url
    }

    const hostname = getGenericHostname(url)
    return this._showPopup({
      type: PopupType.GenericGitAuthentication,
      hostname,
      retryAction,
    })
  }
}
