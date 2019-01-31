import { ipcRenderer, remote } from 'electron'
import { pathExists } from 'fs-extra'
import { escape } from 'querystring'
import {
  AccountsStore,
  CloningRepositoriesStore,
  GitHubUserStore,
  GitStore,
  IssuesStore,
  PullRequestStore,
  RepositoriesStore,
  SignInStore,
} from '.'
import { Account } from '../../models/account'
import { AppMenu, IMenu } from '../../models/app-menu'
import { IAuthor } from '../../models/author'
import {
  Branch,
  eligibleForFastForward,
  IAheadBehind,
} from '../../models/branch'
import { BranchesTab } from '../../models/branches-tab'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { CloningRepository } from '../../models/cloning-repository'
import { Commit, ICommitContext } from '../../models/commit'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
  ImageDiffType,
} from '../../models/diff'
import { FetchType } from '../../models/fetch'
import { GitHubRepository } from '../../models/github-repository'
import { Owner } from '../../models/owner'
import { PullRequest } from '../../models/pull-request'
import { forkPullRequestRemoteName, IRemote } from '../../models/remote'
import {
  ILocalRepositoryState,
  nameOf,
  Repository,
} from '../../models/repository'
import {
  CommittedFileChange,
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
  AppFileStatusKind,
} from '../../models/status'
import { TipState } from '../../models/tip'
import { ICommitMessage } from '../../models/commit-message'
import {
  Progress,
  ICheckoutProgress,
  IFetchProgress,
  IRevertProgress,
} from '../../models/progress'
import { Popup, PopupType } from '../../models/popup'
import { IGitAccount } from '../../models/git-account'
import { themeChangeMonitor } from '../../ui/lib/theme-change-monitor'
import { getAppPath } from '../../ui/lib/app-proxy'
import {
  ApplicationTheme,
  getPersistedTheme,
  setPersistedTheme,
  getAutoSwitchPersistedTheme,
  setAutoSwitchPersistedTheme,
} from '../../ui/lib/application-theme'
import {
  getAppMenu,
  updatePreferredAppMenuItemLabels,
} from '../../ui/main-process-proxy'
import {
  API,
  getAccountForEndpoint,
  getDotComAPIEndpoint,
  getEnterpriseAPIURL,
  IAPIUser,
} from '../api'
import { shell } from '../app-shell'
import {
  CompareAction,
  HistoryTabMode,
  Foldout,
  FoldoutType,
  IAppState,
  ICompareBranch,
  ICompareFormUpdate,
  ICompareToBranch,
  IDisplayHistory,
  PossibleSelections,
  RepositorySectionTab,
  SelectionType,
  MergeResultStatus,
  ComparisonMode,
  SuccessfulMergeBannerState,
  MergeConflictsBannerState,
} from '../app-state'
import { IGitHubUser } from '../databases/github-user-database'
import {
  ExternalEditor,
  findEditorOrDefault,
  getAvailableEditors,
  launchExternalEditor,
  parse,
} from '../editors'
import { assertNever, fatalError, forceUnwrap } from '../fatal-error'

import { findAccountForRemoteURL } from '../find-account'
import { formatCommitMessage } from '../format-commit-message'
import { getGenericHostname, getGenericUsername } from '../generic-git-auth'
import { getAccountForRepository } from '../get-account-for-repository'
import {
  abortMerge,
  addRemote,
  checkoutBranch,
  createBranch,
  createCommit,
  deleteBranch,
  formatAsLocalRef,
  getAuthorIdentity,
  getBranchAheadBehind,
  getChangedFiles,
  getCommitDiff,
  getMergeBase,
  getRemotes,
  getWorkingDirectoryDiff,
  isCoAuthoredByTrailer,
  mergeTree,
  pull as pullRepo,
  push as pushRepo,
  renameBranch,
  updateRef,
  saveGitIgnore,
  appendIgnoreRule,
  createMergeCommit,
  getBranchesPointedAt,
  isGitRepository,
} from '../git'
import {
  installGlobalLFSFilters,
  installLFSHooks,
  isUsingLFS,
} from '../git/lfs'
import { inferLastPushForRepository } from '../infer-last-push-for-repository'
import { updateMenuState } from '../menu-update'
import { merge } from '../merge'
import {
  IMatchedGitHubRepository,
  matchGitHubRepository,
  repositoryMatchesRemote,
} from '../repository-matching'
import { RetryAction, RetryActionType } from '../../models/retry-actions'
import {
  Default as DefaultShell,
  findShellOrDefault,
  launchShell,
  parse as parseShell,
  Shell,
} from '../shells'
import {
  ILaunchStats,
  StatsStore,
  markUsageStatsNoteSeen,
  hasSeenUsageStatsNote,
} from '../stats'
import { hasShownWelcomeFlow, markWelcomeFlowComplete } from '../welcome'
import { getWindowState, WindowState } from '../window-state'
import { TypedBaseStore } from './base-store'
import { AheadBehindUpdater } from './helpers/ahead-behind-updater'
import { MergeResultKind } from '../../models/merge'
import { promiseWithMinimumTimeout } from '../promise'
import { BackgroundFetcher } from './helpers/background-fetcher'
import { inferComparisonBranch } from './helpers/infer-comparison-branch'
import { PullRequestUpdater } from './helpers/pull-request-updater'
import { validatedRepositoryPath } from './helpers/validated-repository-path'
import { RepositoryStateCache } from './repository-state-cache'
import { readEmoji } from '../read-emoji'
import { GitStoreCache } from './git-store-cache'
import { MergeConflictsErrorContext } from '../git-error-context'
import { setNumber, setBoolean, getBoolean, getNumber } from '../local-storage'
import { ExternalEditorError } from '../editors/shared'
import { ApiRepositoriesStore } from './api-repositories-store'
import {
  updateChangedFiles,
  updateConflictState,
} from './updates/changes-state'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'

/**
 * As fast-forwarding local branches is proportional to the number of local
 * branches, and is run after every fetch/push/pull, this is skipped when the
 * number of eligible branches is greater than a given threshold.
 */
const FastForwardBranchesThreshold = 20

const LastSelectedRepositoryIDKey = 'last-selected-repository-id'

const defaultSidebarWidth: number = 250
const sidebarWidthConfigKey: string = 'sidebar-width'

const defaultCommitSummaryWidth: number = 250
const commitSummaryWidthConfigKey: string = 'commit-summary-width'

const confirmRepoRemovalDefault: boolean = true
const confirmDiscardChangesDefault: boolean = true
const confirmRepoRemovalKey: string = 'confirmRepoRemoval'
const confirmDiscardChangesKey: string = 'confirmDiscardChanges'

const externalEditorKey: string = 'externalEditor'

const imageDiffTypeDefault = ImageDiffType.TwoUp
const imageDiffTypeKey = 'image-diff-type'

const shellKey = 'shell'

// background fetching should occur hourly when Desktop is active, but this
// lower interval ensures user interactions like switching repositories and
// switching between apps does not result in excessive fetching in the app
const BackgroundFetchMinimumInterval = 30 * 60 * 1000

export class AppStore extends TypedBaseStore<IAppState> {
  private readonly gitStoreCache: GitStoreCache

  private accounts: ReadonlyArray<Account> = new Array<Account>()
  private repositories: ReadonlyArray<Repository> = new Array<Repository>()

  private selectedRepository: Repository | CloningRepository | null = null

  /** The background fetcher for the currently selected repository. */
  private currentBackgroundFetcher: BackgroundFetcher | null = null

  /** The pull request updater for the currently selected repository */
  private currentPullRequestUpdater: PullRequestUpdater | null = null

  /** The ahead/behind updater or the currently selected repository */
  private currentAheadBehindUpdater: AheadBehindUpdater | null = null

  private showWelcomeFlow = false
  private focusCommitMessage = false
  private currentPopup: Popup | null = null
  private currentFoldout: Foldout | null = null
  private errors: ReadonlyArray<Error> = new Array<Error>()
  private emitQueued = false

  private readonly localRepositoryStateLookup = new Map<
    number,
    ILocalRepositoryState
  >()

  /** Map from shortcut (e.g., :+1:) to on disk URL. */
  private emoji = new Map<string, string>()

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
  private successfulMergeBannerState: SuccessfulMergeBannerState = null
  private mergeConflictsBannerState: MergeConflictsBannerState = null
  private confirmRepoRemoval: boolean = confirmRepoRemovalDefault
  private confirmDiscardChanges: boolean = confirmDiscardChangesDefault
  private imageDiffType: ImageDiffType = imageDiffTypeDefault

  private selectedExternalEditor?: ExternalEditor

  private resolvedExternalEditor: ExternalEditor | null = null

  /** The user's preferred shell. */
  private selectedShell = DefaultShell

  /** The current repository filter text */
  private repositoryFilterText: string = ''

  private currentMergeTreePromise: Promise<void> | null = null

  /** The function to resolve the current Open in Desktop flow. */
  private resolveOpenInDesktop:
    | ((repository: Repository | null) => void)
    | null = null

  private selectedCloneRepositoryTab = CloneRepositoryTab.DotCom

  private selectedBranchesTab = BranchesTab.Branches
  private selectedTheme = ApplicationTheme.Light
  private automaticallySwitchTheme = false

  public constructor(
    private readonly gitHubUserStore: GitHubUserStore,
    private readonly cloningRepositoriesStore: CloningRepositoriesStore,
    private readonly issuesStore: IssuesStore,
    private readonly statsStore: StatsStore,
    private readonly signInStore: SignInStore,
    private readonly accountsStore: AccountsStore,
    private readonly repositoriesStore: RepositoriesStore,
    private readonly pullRequestStore: PullRequestStore,
    private readonly repositoryStateCache: RepositoryStateCache,
    private readonly apiRepositoriesStore: ApiRepositoriesStore
  ) {
    super()

    this.showWelcomeFlow = !hasShownWelcomeFlow()

    this.gitStoreCache = new GitStoreCache(
      shell,
      (repo, store) => this.onGitStoreUpdated(repo, store),
      (repo, commits) => this.loadAndCacheUsers(repo, this.accounts, commits),
      error => this.emitError(error)
    )

    const window = remote.getCurrentWindow()
    this.windowState = getWindowState(window)

    window.webContents.getZoomFactor(factor => {
      this.onWindowZoomFactorChanged(factor)
    })

    this.wireupIpcEventHandlers(window)
    this.wireupStoreEventHandlers()
    getAppMenu()
  }

  private wireupIpcEventHandlers(window: Electron.BrowserWindow) {
    ipcRenderer.on(
      'window-state-changed',
      (event: Electron.IpcMessageEvent, args: any[]) => {
        this.windowState = getWindowState(window)
        this.emitUpdate()
      }
    )

    ipcRenderer.on('zoom-factor-changed', (event: any, zoomFactor: number) => {
      this.onWindowZoomFactorChanged(zoomFactor)
    })

    ipcRenderer.on(
      'app-menu',
      (event: Electron.IpcMessageEvent, { menu }: { menu: IMenu }) => {
        this.setAppMenu(menu)
      }
    )
  }

  private wireupStoreEventHandlers() {
    this.gitHubUserStore.onDidUpdate(() => {
      this.emitUpdate()
    })

    this.cloningRepositoriesStore.onDidUpdate(() => {
      this.emitUpdate()
    })

    this.cloningRepositoriesStore.onDidError(e => this.emitError(e))

    this.signInStore.onDidAuthenticate((account, method) => {
      this._addAccount(account)

      if (this.showWelcomeFlow) {
        this.statsStore.recordWelcomeWizardSignInMethod(method)
      }
    })
    this.signInStore.onDidUpdate(() => this.emitUpdate())
    this.signInStore.onDidError(error => this.emitError(error))

    this.accountsStore.onDidUpdate(async () => {
      const accounts = await this.accountsStore.getAll()
      this.accounts = accounts
      this.emitUpdate()
    })
    this.accountsStore.onDidError(error => this.emitError(error))

    this.repositoriesStore.onDidUpdate(async () => {
      this.repositories = await this.repositoriesStore.getAll()
      this.updateRepositorySelectionAfterRepositoriesChanged()
      this.emitUpdate()
    })

    this.pullRequestStore.onDidError(error => this.emitError(error))
    this.pullRequestStore.onDidUpdate(gitHubRepository =>
      this.onPullRequestStoreUpdated(gitHubRepository)
    )

    this.apiRepositoriesStore.onDidUpdate(() => this.emitUpdate())
    this.apiRepositoriesStore.onDidError(error => this.emitError(error))
  }

  /** Load the emoji from disk. */
  public loadEmoji() {
    const rootDir = getAppPath()
    readEmoji(rootDir)
      .then(emoji => {
        this.emoji = emoji
        this.emitUpdate()
      })
      .catch(err => {
        log.warn(`Unexpected issue when trying to read emoji into memory`, err)
      })
  }

  protected emitUpdate() {
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

    super.emitUpdate(state)
    updateMenuState(state, this.appMenu)
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

      return { type: SelectionType.CloningRepository, repository, progress }
    }

    if (repository.missing) {
      return { type: SelectionType.MissingRepository, repository }
    }

    return {
      type: SelectionType.Repository,
      repository,
      state: this.repositoryStateCache.get(repository),
    }
  }

  public getState(): IAppState {
    const repositories = [
      ...this.repositories,
      ...this.cloningRepositoriesStore.repositories,
    ]

    return {
      accounts: this.accounts,
      repositories,
      localRepositoryStateLookup: this.localRepositoryStateLookup,
      windowState: this.windowState,
      windowZoomFactor: this.windowZoomFactor,
      appIsFocused: this.appIsFocused,
      selectedState: this.getSelectedState(),
      signInState: this.signInStore.getState(),
      currentPopup: this.currentPopup,
      currentFoldout: this.currentFoldout,
      errors: this.errors,
      showWelcomeFlow: this.showWelcomeFlow,
      focusCommitMessage: this.focusCommitMessage,
      emoji: this.emoji,
      sidebarWidth: this.sidebarWidth,
      commitSummaryWidth: this.commitSummaryWidth,
      appMenuState: this.appMenu ? this.appMenu.openMenus : [],
      titleBarStyle:
        this.showWelcomeFlow || repositories.length === 0 ? 'light' : 'dark',
      highlightAccessKeys: this.highlightAccessKeys,
      isUpdateAvailableBannerVisible: this.isUpdateAvailableBannerVisible,
      successfulMergeBannerState: this.successfulMergeBannerState,
      mergeConflictsBannerState: this.mergeConflictsBannerState,
      askForConfirmationOnRepositoryRemoval: this.confirmRepoRemoval,
      askForConfirmationOnDiscardChanges: this.confirmDiscardChanges,
      selectedExternalEditor: this.selectedExternalEditor,
      imageDiffType: this.imageDiffType,
      selectedShell: this.selectedShell,
      repositoryFilterText: this.repositoryFilterText,
      resolvedExternalEditor: this.resolvedExternalEditor,
      selectedCloneRepositoryTab: this.selectedCloneRepositoryTab,
      selectedBranchesTab: this.selectedBranchesTab,
      selectedTheme: this.selectedTheme,
      automaticallySwitchTheme: this.automaticallySwitchTheme,
      apiRepositories: this.apiRepositoriesStore.getState(),
    }
  }

  private onGitStoreUpdated(repository: Repository, gitStore: GitStore) {
    this.repositoryStateCache.updateBranchesState(repository, () => ({
      tip: gitStore.tip,
      defaultBranch: gitStore.defaultBranch,
      allBranches: gitStore.allBranches,
      recentBranches: gitStore.recentBranches,
    }))

    this.repositoryStateCache.updateChangesState(repository, () => ({
      commitMessage: gitStore.commitMessage,
      showCoAuthoredBy: gitStore.showCoAuthoredBy,
      coAuthors: gitStore.coAuthors,
    }))

    this.repositoryStateCache.update(repository, () => ({
      commitLookup: gitStore.commitLookup,
      localCommitSHAs: gitStore.localCommitSHAs,
      aheadBehind: gitStore.aheadBehind,
      remote: gitStore.currentRemote,
      lastFetched: gitStore.lastFetched,
    }))

    this.emitUpdate()
  }

  private clearSelectedCommit(repository: Repository) {
    this.repositoryStateCache.updateCommitSelection(repository, () => ({
      sha: null,
      file: null,
      changedFiles: [],
      diff: null,
    }))
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeCommitSelection(
    repository: Repository,
    sha: string
  ): Promise<void> {
    const { commitSelection } = this.repositoryStateCache.get(repository)

    if (commitSelection.sha === sha) {
      return
    }

    this.repositoryStateCache.updateCommitSelection(repository, () => ({
      sha,
      file: null,
      changedFiles: [],
      diff: null,
    }))

    this.emitUpdate()
  }

  private updateOrSelectFirstCommit(
    repository: Repository,
    commitSHAs: ReadonlyArray<string>
  ) {
    const state = this.repositoryStateCache.get(repository)
    let selectedSHA = state.commitSelection.sha
    if (selectedSHA != null) {
      const index = commitSHAs.findIndex(sha => sha === selectedSHA)
      if (index < 0) {
        // selected SHA is not in this list
        // -> clear the selection in the app state
        selectedSHA = null
        this.clearSelectedCommit(repository)
      }
    }

    if (selectedSHA == null && commitSHAs.length > 0) {
      this._changeCommitSelection(repository, commitSHAs[0])
      this._loadChangedFilesForCurrentSelection(repository)
    }
  }

  private startAheadBehindUpdater(repository: Repository) {
    if (this.currentAheadBehindUpdater != null) {
      fatalError(
        `An ahead/behind updater is already active and cannot start updating on ${
          repository.name
        }`
      )

      return
    }

    const updater = new AheadBehindUpdater(repository, aheadBehindCache => {
      this.repositoryStateCache.updateCompareState(repository, () => ({
        aheadBehindCache,
      }))
      this.emitUpdate()
    })

    this.currentAheadBehindUpdater = updater

    this.currentAheadBehindUpdater.start()
  }

  private stopAheadBehindUpdate() {
    const updater = this.currentAheadBehindUpdater

    if (updater != null) {
      updater.stop()
      this.currentAheadBehindUpdater = null
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _initializeCompare(
    repository: Repository,
    initialAction?: CompareAction
  ) {
    log.debug('[AppStore] initializing compare state')

    const state = this.repositoryStateCache.get(repository)

    const { branchesState, compareState } = state
    const { tip, currentPullRequest } = branchesState
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null

    const allBranches =
      currentBranch != null
        ? branchesState.allBranches.filter(b => b.name !== currentBranch.name)
        : branchesState.allBranches
    const recentBranches = currentBranch
      ? branchesState.recentBranches.filter(b => b.name !== currentBranch.name)
      : branchesState.recentBranches

    const cachedDefaultBranch = branchesState.defaultBranch

    // only include the default branch when comparing if the user is not on the default branch
    // and it also exists in the repository
    const defaultBranch =
      currentBranch != null &&
      cachedDefaultBranch != null &&
      currentBranch.name !== cachedDefaultBranch.name
        ? cachedDefaultBranch
        : null

    let inferredBranch: Branch | null = null
    let aheadBehindOfInferredBranch: IAheadBehind | null = null
    if (tip.kind === TipState.Valid && compareState.aheadBehindCache !== null) {
      inferredBranch = await inferComparisonBranch(
        repository,
        allBranches,
        currentPullRequest,
        tip.branch,
        getRemotes,
        compareState.aheadBehindCache
      )

      if (inferredBranch !== null) {
        aheadBehindOfInferredBranch = compareState.aheadBehindCache.get(
          tip.branch.tip.sha,
          inferredBranch.tip.sha
        )
      }
    }

    this.repositoryStateCache.updateCompareState(repository, () => ({
      allBranches,
      recentBranches,
      defaultBranch,
      inferredComparisonBranch: {
        branch: inferredBranch,
        aheadBehind: aheadBehindOfInferredBranch,
      },
    }))

    if (inferredBranch !== null) {
      const currentCount = getBehindOrDefault(aheadBehindOfInferredBranch)

      const prevInferredBranchState =
        state.compareState.inferredComparisonBranch

      const previousCount = getBehindOrDefault(
        prevInferredBranchState.aheadBehind
      )

      // we only want to show the banner when the the number
      // commits behind has changed since the last it was visible
      const countChanged = currentCount > 0 && previousCount !== currentCount
      this._setDivergingBranchBannerVisibility(repository, countChanged)
    } else {
      this._setDivergingBranchBannerVisibility(repository, false)
    }

    const cachedState = compareState.formState
    const action =
      initialAction != null ? initialAction : getInitialAction(cachedState)
    this._executeCompare(repository, action)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _executeCompare(
    repository: Repository,
    action: CompareAction
  ): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)
    const kind = action.kind

    if (action.kind === HistoryTabMode.History) {
      const { tip } = gitStore

      let currentSha: string | null = null

      if (tip.kind === TipState.Valid) {
        currentSha = tip.branch.tip.sha
      } else if (tip.kind === TipState.Detached) {
        currentSha = tip.currentSha
      }

      const { compareState } = this.repositoryStateCache.get(repository)
      const { formState, commitSHAs } = compareState
      const previousTip = compareState.tip

      const tipIsUnchanged =
        currentSha !== null &&
        previousTip !== null &&
        currentSha === previousTip

      if (
        tipIsUnchanged &&
        formState.kind === HistoryTabMode.History &&
        commitSHAs.length > 0
      ) {
        // don't refresh the history view here because we know nothing important
        // has changed and we don't want to rebuild this state
        return
      }

      // load initial group of commits for current branch
      const commits = await gitStore.loadCommitBatch('HEAD')

      if (commits === null) {
        return
      }

      const newState: IDisplayHistory = {
        kind: HistoryTabMode.History,
      }

      this.repositoryStateCache.updateCompareState(repository, () => ({
        tip: currentSha,
        formState: newState,
        commitSHAs: commits,
        filterText: '',
        showBranchList: false,
      }))
      this.updateOrSelectFirstCommit(repository, commits)

      return this.emitUpdate()
    }

    if (action.kind === HistoryTabMode.Compare) {
      return this.updateCompareToBranch(repository, action)
    }

    return assertNever(action, `Unknown action: ${kind}`)
  }

  private async updateCompareToBranch(
    repository: Repository,
    action: ICompareToBranch
  ) {
    const gitStore = this.gitStoreCache.get(repository)

    const comparisonBranch = action.branch
    const compare = await gitStore.getCompareCommits(
      comparisonBranch,
      action.comparisonMode
    )

    this.statsStore.recordBranchComparison()
    const { branchesState } = this.repositoryStateCache.get(repository)

    if (
      branchesState.defaultBranch !== null &&
      comparisonBranch.name === branchesState.defaultBranch.name
    ) {
      this.statsStore.recordDefaultBranchComparison()
    }

    if (compare == null) {
      return
    }

    const { ahead, behind } = compare
    const aheadBehind = { ahead, behind }

    const commitSHAs = compare.commits.map(commit => commit.sha)

    const newState: ICompareBranch = {
      kind: HistoryTabMode.Compare,
      comparisonBranch,
      comparisonMode: action.comparisonMode,
      aheadBehind,
    }

    this.repositoryStateCache.updateCompareState(repository, s => ({
      formState: newState,
      filterText: comparisonBranch.name,
      commitSHAs,
    }))

    const tip = gitStore.tip

    let currentSha: string | null = null

    if (tip.kind === TipState.Valid) {
      currentSha = tip.branch.tip.sha
    } else if (tip.kind === TipState.Detached) {
      currentSha = tip.currentSha
    }

    if (this.currentAheadBehindUpdater != null && currentSha != null) {
      const from =
        action.comparisonMode === ComparisonMode.Ahead
          ? comparisonBranch.tip.sha
          : currentSha
      const to =
        action.comparisonMode === ComparisonMode.Ahead
          ? currentSha
          : comparisonBranch.tip.sha

      this.currentAheadBehindUpdater.insert(from, to, aheadBehind)
    }

    const loadingMerge: MergeResultStatus = { kind: MergeResultKind.Loading }

    this.repositoryStateCache.updateCompareState(repository, () => ({
      mergeStatus: loadingMerge,
    }))

    this.emitUpdate()

    this.updateOrSelectFirstCommit(repository, commitSHAs)

    if (this.currentMergeTreePromise != null) {
      return this.currentMergeTreePromise
    }

    if (tip.kind === TipState.Valid && aheadBehind.behind > 0) {
      const mergeTreePromise = promiseWithMinimumTimeout(
        () => mergeTree(repository, tip.branch, action.branch),
        500
      )
        .catch(err => {
          log.warn(
            `Error occurred while trying to merge ${tip.branch.name} (${
              tip.branch.tip.sha
            }) and ${action.branch.name} (${action.branch.tip.sha})`,
            err
          )
          return null
        })
        .then(mergeStatus => {
          this.repositoryStateCache.updateCompareState(repository, () => ({
            mergeStatus,
          }))

          this.emitUpdate()
        })

      const cleanup = () => {
        this.currentMergeTreePromise = null
      }

      // TODO: when we have Promise.prototype.finally available we
      //       should use that here to make this intent clearer
      mergeTreePromise.then(cleanup, cleanup)

      this.currentMergeTreePromise = mergeTreePromise

      return this.currentMergeTreePromise
    } else {
      this.repositoryStateCache.updateCompareState(repository, () => ({
        mergeStatus: null,
      }))

      return this.emitUpdate()
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _updateCompareForm<K extends keyof ICompareFormUpdate>(
    repository: Repository,
    newState: Pick<ICompareFormUpdate, K>
  ) {
    this.repositoryStateCache.updateCompareState(repository, state => {
      return merge(state, newState)
    })

    this.emitUpdate()

    const { branchesState, compareState } = this.repositoryStateCache.get(
      repository
    )

    if (branchesState.tip.kind !== TipState.Valid) {
      return
    }

    if (this.currentAheadBehindUpdater === null) {
      return
    }

    if (compareState.showBranchList) {
      const currentBranch = branchesState.tip.branch

      this.currentAheadBehindUpdater.schedule(
        currentBranch,
        compareState.defaultBranch,
        compareState.recentBranches,
        compareState.allBranches
      )
    } else {
      this.currentAheadBehindUpdater.clear()
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadNextCommitBatch(repository: Repository): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)

    const state = this.repositoryStateCache.get(repository)
    const { formState } = state.compareState
    if (formState.kind === HistoryTabMode.History) {
      const commits = state.compareState.commitSHAs
      const lastCommitSha = commits[commits.length - 1]

      const newCommits = await gitStore.loadCommitBatch(`${lastCommitSha}^`)
      if (newCommits == null) {
        return
      }

      this.repositoryStateCache.updateCompareState(repository, () => ({
        commitSHAs: commits.concat(newCommits),
      }))
      this.emitUpdate()
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _loadChangedFilesForCurrentSelection(
    repository: Repository
  ): Promise<void> {
    const state = this.repositoryStateCache.get(repository)
    const { commitSelection } = state
    const currentSHA = commitSelection.sha
    if (currentSHA == null) {
      return
    }

    const gitStore = this.gitStoreCache.get(repository)
    const changedFiles = await gitStore.performFailableOperation(() =>
      getChangedFiles(repository, currentSHA)
    )
    if (!changedFiles) {
      return
    }

    // The selection could have changed between when we started loading the
    // changed files and we finished. We might wanna store the changed files per
    // SHA/path.
    if (currentSHA !== state.commitSelection.sha) {
      return
    }

    // if we're selecting a commit for the first time, we should select the
    // first file in the commit and render the diff immediately

    const noFileSelected = commitSelection.file === null

    const firstFileOrDefault =
      noFileSelected && changedFiles.length
        ? changedFiles[0]
        : commitSelection.file

    this.repositoryStateCache.updateCommitSelection(repository, () => ({
      file: firstFileOrDefault,
      changedFiles,
      diff: null,
    }))

    this.emitUpdate()

    if (firstFileOrDefault !== null) {
      this._changeFileSelection(repository, firstFileOrDefault)
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _setRepositoryFilterText(text: string): Promise<void> {
    this.repositoryFilterText = text
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _setBranchFilterText(
    repository: Repository,
    text: string
  ): Promise<void> {
    this.repositoryStateCache.update(repository, () => ({
      branchFilterText: text,
    }))
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _setPullRequestFilterText(
    repository: Repository,
    text: string
  ): Promise<void> {
    this.repositoryStateCache.update(repository, () => ({
      pullRequestFilterText: text,
    }))
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeFileSelection(
    repository: Repository,
    file: CommittedFileChange
  ): Promise<void> {
    this.repositoryStateCache.updateCommitSelection(repository, () => ({
      file,
      diff: null,
    }))
    this.emitUpdate()

    const stateBeforeLoad = this.repositoryStateCache.get(repository)
    const sha = stateBeforeLoad.commitSelection.sha

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

    const stateAfterLoad = this.repositoryStateCache.get(repository)

    // A whole bunch of things could have happened since we initiated the diff load
    if (
      stateAfterLoad.commitSelection.sha !== stateBeforeLoad.commitSelection.sha
    ) {
      return
    }
    if (!stateAfterLoad.commitSelection.file) {
      return
    }
    if (stateAfterLoad.commitSelection.file.id !== file.id) {
      return
    }

    this.repositoryStateCache.updateCommitSelection(repository, () => ({
      diff,
    }))

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
    this.stopPullRequestUpdater()
    this._setMergeConflictsBannerState(null)

    if (repository == null) {
      return Promise.resolve(null)
    }

    if (!(repository instanceof Repository)) {
      return Promise.resolve(null)
    }

    setNumber(LastSelectedRepositoryIDKey, repository.id)

    // if repository might be marked missing, try checking if it has been restored
    const refreshedRepository = await this.recoverMissingRepository(repository)
    if (refreshedRepository.missing) {
      // as the repository is no longer found on disk, cleaning this up
      // ensures we don't accidentally run any Git operations against the
      // wrong location if the user then relocates the `.git` folder elsewhere
      this.gitStoreCache.remove(repository)
      return Promise.resolve(null)
    }

    return this._selectRepositoryRefreshTasks(
      refreshedRepository,
      previouslySelectedRepository
    )
  }

  // finish `_selectRepository`s refresh tasks
  private async _selectRepositoryRefreshTasks(
    repository: Repository,
    previouslySelectedRepository: Repository | CloningRepository | null
  ): Promise<Repository | null> {
    this._refreshRepository(repository)

    const gitHubRepository = repository.gitHubRepository

    if (gitHubRepository != null) {
      this._refreshIssues(gitHubRepository)
      this.loadPullRequests(repository, async () => {
        const promiseForPRs = this.pullRequestStore.fetchPullRequestsFromCache(
          gitHubRepository
        )
        const isLoading = this.pullRequestStore.isFetchingPullRequests(
          gitHubRepository
        )

        const prs = await promiseForPRs

        if (prs.length > 0) {
          this.repositoryStateCache.updateBranchesState(repository, () => {
            return {
              openPullRequests: prs,
              isLoadingPullRequests: isLoading,
            }
          })
        } else {
          this._refreshPullRequests(repository)
        }

        this._updateCurrentPullRequest(repository)
        this.emitUpdate()
      })
    }

    // The selected repository could have changed while we were refreshing.
    if (this.selectedRepository !== repository) {
      return null
    }

    // "Clone in Desktop" from a cold start can trigger this twice, and
    // for edge cases where _selectRepository is re-entract, calling this here
    // ensures we clean up the existing background fetcher correctly (if set)
    this.stopBackgroundFetching()
    this.stopPullRequestUpdater()
    this.stopAheadBehindUpdate()

    this.startBackgroundFetching(repository, !previouslySelectedRepository)
    this.startPullRequestUpdater(repository)

    this.startAheadBehindUpdater(repository)
    this.refreshMentionables(repository)

    this.addUpstreamRemoteIfNeeded(repository)

    return this.repositoryWithRefreshedGitHubRepository(repository)
  }

  public async _refreshIssues(repository: GitHubRepository) {
    const user = getAccountForEndpoint(this.accounts, repository.endpoint)
    if (!user) {
      return
    }

    try {
      await this.issuesStore.refreshIssues(repository, user)
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
    const account = getAccountForRepository(this.accounts, repository)
    if (!account) {
      return
    }

    const gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) {
      return
    }

    this.gitHubUserStore.updateMentionables(gitHubRepository, account)
  }

  private startPullRequestUpdater(repository: Repository) {
    if (this.currentPullRequestUpdater) {
      fatalError(
        `A pull request updater is already active and cannot start updating on ${nameOf(
          repository
        )}`
      )

      return
    }

    if (!repository.gitHubRepository) {
      return
    }

    const account = getAccountForRepository(this.accounts, repository)

    if (!account) {
      return
    }

    const updater = new PullRequestUpdater(
      repository,
      account,
      this.pullRequestStore
    )
    this.currentPullRequestUpdater = updater

    this.currentPullRequestUpdater.start()
  }

  private stopPullRequestUpdater() {
    const updater = this.currentPullRequestUpdater

    if (updater) {
      updater.stop()
      this.currentPullRequestUpdater = null
    }
  }

  private shouldBackgroundFetch(
    repository: Repository,
    lastPush: Date | null
  ): boolean {
    const gitStore = this.gitStoreCache.get(repository)
    const lastFetched = gitStore.lastFetched

    if (lastFetched === null) {
      return true
    }

    const now = new Date()
    const timeSinceFetch = now.getTime() - lastFetched.getTime()
    const repoName = nameOf(repository)
    if (timeSinceFetch < BackgroundFetchMinimumInterval) {
      const timeInSeconds = Math.floor(timeSinceFetch / 1000)

      log.debug(
        `Skipping background fetch as '${repoName}' was fetched ${timeInSeconds}s ago`
      )
      return false
    }

    if (lastPush === null) {
      return true
    }

    // we should fetch if the last push happened after the last fetch
    if (lastFetched < lastPush) {
      return true
    }

    log.debug(
      `Skipping background fetch since nothing has been pushed to '${repoName}' since the last fetch at ${lastFetched}`
    )

    return false
  }

  private startBackgroundFetching(
    repository: Repository,
    withInitialSkew: boolean
  ) {
    if (this.currentBackgroundFetcher) {
      fatalError(
        `We should only have on background fetcher active at once, but we're trying to start background fetching on ${
          repository.name
        } while another background fetcher is still active!`
      )
      return
    }

    const account = getAccountForRepository(this.accounts, repository)
    if (!account) {
      return
    }

    if (!repository.gitHubRepository) {
      return
    }

    // Todo: add logic to background checker to check the API before fetching
    // similar to what's being done in `refreshAllIndicators`
    const fetcher = new BackgroundFetcher(
      repository,
      account,
      r => this.performFetch(r, account, FetchType.BackgroundTask),
      r => this.shouldBackgroundFetch(r, null)
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

    log.info(
      `[AppStore] loading ${repositories.length} repositories from store`
    )
    accounts.forEach(a => {
      log.info(`[AppStore] found account: ${a.login} (${a.name})`)
    })

    this.accounts = accounts
    this.repositories = repositories

    // doing this that the current user can be found by any of their email addresses
    for (const account of accounts) {
      const userAssociations: ReadonlyArray<IGitHubUser> = account.emails.map(
        email =>
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

    this.updateRepositorySelectionAfterRepositoriesChanged()

    this.sidebarWidth = getNumber(sidebarWidthConfigKey, defaultSidebarWidth)
    this.commitSummaryWidth = getNumber(
      commitSummaryWidthConfigKey,
      defaultCommitSummaryWidth
    )

    this.confirmRepoRemoval = getBoolean(
      confirmRepoRemovalKey,
      confirmRepoRemovalDefault
    )

    this.confirmDiscardChanges = getBoolean(
      confirmDiscardChangesKey,
      confirmDiscardChangesDefault
    )

    const externalEditorValue = await this.getSelectedExternalEditor()
    if (externalEditorValue) {
      this.selectedExternalEditor = externalEditorValue
    }

    const shellValue = localStorage.getItem(shellKey)
    this.selectedShell = shellValue ? parseShell(shellValue) : DefaultShell

    this.updateMenuItemLabels()

    const imageDiffTypeValue = localStorage.getItem(imageDiffTypeKey)
    this.imageDiffType =
      imageDiffTypeValue === null
        ? imageDiffTypeDefault
        : parseInt(imageDiffTypeValue)

    this.selectedTheme = getPersistedTheme()
    this.automaticallySwitchTheme = getAutoSwitchPersistedTheme()

    themeChangeMonitor.onThemeChanged(theme => {
      if (this.automaticallySwitchTheme) {
        this.selectedTheme = theme
        this.emitUpdate()
      }
    })

    this.emitUpdateNow()

    this.accountsStore.refresh()
  }

  private async getSelectedExternalEditor(): Promise<ExternalEditor | null> {
    const externalEditorValue = localStorage.getItem(externalEditorKey)
    if (externalEditorValue) {
      const value = parse(externalEditorValue)
      if (value) {
        return value
      }
    }

    const editors = await getAvailableEditors()
    if (editors.length) {
      const value = editors[0].editor
      // store this value to avoid the lookup next time
      localStorage.setItem(externalEditorKey, value)
      return value
    }

    return null
  }

  /**
   * Update menu labels for editor, shell, and pull requests.
   */
  private updateMenuItemLabels(repository?: Repository) {
    const editorLabel = this.selectedExternalEditor
      ? `Open in ${this.selectedExternalEditor}`
      : undefined

    updatePreferredAppMenuItemLabels({
      editorLabel: editorLabel,
      pullRequestLabel: this.getPullRequestLabel(repository),
      shellLabel: `Open in ${this.selectedShell}`,
      defaultBranchName: this.getDefaultBranchName(repository),
    })
  }

  private getBranchesState(repository?: Repository) {
    if (!repository || !repository.gitHubRepository) {
      return undefined
    }

    const state = this.repositoryStateCache.get(repository)
    return state.branchesState
  }

  private getPullRequestLabel(repository?: Repository) {
    const branchesState = this.getBranchesState(repository)
    if (branchesState == null) {
      return undefined
    }

    if (branchesState.currentPullRequest === null) {
      return undefined
    }

    return __DARWIN__ ? 'Show Pull Request' : 'Show &pull request'
  }

  private getDefaultBranchName(repository?: Repository) {
    const branchesState = this.getBranchesState(repository)
    if (branchesState == null) {
      return undefined
    }

    const { defaultBranch } = branchesState
    if (defaultBranch == null || defaultBranch.upstreamWithoutRemote == null) {
      return undefined
    }
    return defaultBranch.upstreamWithoutRemote
  }

  private updateRepositorySelectionAfterRepositoriesChanged() {
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
      const lastSelectedID = getNumber(LastSelectedRepositoryIDKey, 0)
      if (lastSelectedID > 0) {
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
        selectedRepository.hash !== newSelectedRepository.hash) ||
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
  ): Promise<boolean> {
    const gitStore = this.gitStoreCache.get(repository)
    const status = await gitStore.loadStatus()

    if (!status) {
      return false
    }

    this.repositoryStateCache.updateChangesState(repository, state =>
      updateChangedFiles(state, status, clearPartialState)
    )

    this.repositoryStateCache.updateChangesState(repository, state => ({
      conflictState: updateConflictState(state, status, this.statsStore),
    }))

    this._triggerMergeConflictsFlow(repository)

    this.emitUpdate()

    this.updateChangesDiffForCurrentSelection(repository)

    return true
  }

  /** starts the conflict resolution flow, if appropriate */
  private async _triggerMergeConflictsFlow(repository: Repository) {
    // are we already in the merge conflicts flow?
    const alreadyInFlow =
      this.currentPopup !== null &&
      (this.currentPopup.type === PopupType.MergeConflicts ||
        this.currentPopup.type === PopupType.AbortMerge)

    // have we already been shown the merge conflicts flow *and closed it*?
    const alreadyExitedFlow = this.mergeConflictsBannerState !== null

    if (alreadyInFlow || alreadyExitedFlow) {
      return
    }

    const repoState = this.repositoryStateCache.get(repository)
    const { conflictState } = repoState.changesState
    if (conflictState === null) {
      return
    }

    const possibleTheirsBranches = await getBranchesPointedAt(
      repository,
      'MERGE_HEAD'
    )
    // null means we encountered an error
    if (possibleTheirsBranches === null) {
      return
    }
    const theirBranch =
      possibleTheirsBranches.length === 1
        ? possibleTheirsBranches[0]
        : undefined

    const ourBranch = conflictState.currentBranch
    this._showPopup({
      type: PopupType.MergeConflicts,
      repository,
      ourBranch,
      theirBranch,
    })
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeRepositorySection(
    repository: Repository,
    selectedSection: RepositorySectionTab
  ): Promise<void> {
    this.repositoryStateCache.update(repository, () => ({
      selectedSection,
    }))
    this.emitUpdate()

    if (selectedSection === RepositorySectionTab.History) {
      return this.refreshHistorySection(repository)
    } else if (selectedSection === RepositorySectionTab.Changes) {
      return this.refreshChangesSection(repository, {
        includingStatus: true,
        clearPartialState: false,
      })
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeChangesSelection(
    repository: Repository,
    selectedFiles: WorkingDirectoryFileChange[]
  ): Promise<void> {
    this.repositoryStateCache.updateChangesState(repository, () => ({
      selectedFileIDs: selectedFiles.map(file => file.id),
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
    const stateBeforeLoad = this.repositoryStateCache.get(repository)
    const changesStateBeforeLoad = stateBeforeLoad.changesState
    const selectedFileIDsBeforeLoad = changesStateBeforeLoad.selectedFileIDs

    // We only render diffs when a single file is selected.
    if (selectedFileIDsBeforeLoad.length !== 1) {
      if (changesStateBeforeLoad.diff !== null) {
        this.repositoryStateCache.updateChangesState(repository, () => ({
          diff: null,
        }))
        this.emitUpdate()
      }
      return
    }

    const selectedFileIdBeforeLoad = selectedFileIDsBeforeLoad[0]
    const selectedFileBeforeLoad = changesStateBeforeLoad.workingDirectory.findFileWithID(
      selectedFileIdBeforeLoad
    )

    if (selectedFileBeforeLoad === null) {
      return
    }

    const diff = await getWorkingDirectoryDiff(
      repository,
      selectedFileBeforeLoad
    )

    const stateAfterLoad = this.repositoryStateCache.get(repository)
    const changesState = stateAfterLoad.changesState

    // A different file (or files) could have been selected while we were
    // loading the diff in which case we no longer care about the diff we
    // just loaded.
    if (changesState.selectedFileIDs.length !== 1) {
      return
    }

    const selectedFileID = changesState.selectedFileIDs[0]

    if (selectedFileID !== selectedFileIdBeforeLoad) {
      return
    }

    const currentlySelectedFile = changesState.workingDirectory.findFileWithID(
      selectedFileID
    )
    if (currentlySelectedFile === null) {
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
    const updatedFiles = changesState.workingDirectory.files.map(f =>
      f.id === selectedFile.id ? selectedFile : f
    )
    const workingDirectory = WorkingDirectoryStatus.fromFiles(updatedFiles)

    this.repositoryStateCache.updateChangesState(repository, () => ({
      diff,
      workingDirectory,
    }))
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _commitIncludedChanges(
    repository: Repository,
    context: ICommitContext
  ): Promise<boolean> {
    const state = this.repositoryStateCache.get(repository)
    const files = state.changesState.workingDirectory.files
    const selectedFiles = files.filter(file => {
      return file.selection.getSelectionType() !== DiffSelectionType.None
    })

    const gitStore = this.gitStoreCache.get(repository)

    const result = await this.isCommitting(repository, () => {
      return gitStore.performFailableOperation(async () => {
        const message = await formatCommitMessage(repository, context)
        return createCommit(repository, message, selectedFiles)
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

      const { trailers } = context
      if (trailers !== undefined && trailers.some(isCoAuthoredByTrailer)) {
        this.statsStore.recordCoAuthoredCommit()
      }

      const account = getAccountForRepository(this.accounts, repository)
      if (repository.gitHubRepository !== null) {
        if (account !== null) {
          if (account.endpoint === getDotComAPIEndpoint()) {
            this.statsStore.recordCommitToDotcom()
          } else {
            this.statsStore.recordCommitToEnterprise()
          }

          const { commitAuthor } = state
          if (commitAuthor !== null) {
            const commitEmailMatchesAccount = account.emails.some(
              email =>
                email.email.toLowerCase() === commitAuthor.email.toLowerCase()
            )
            if (!commitEmailMatchesAccount) {
              this.statsStore.recordUnattributedCommit()
            }
          }
        }
      }

      await this._refreshRepository(repository)
      await this.refreshChangesSection(repository, {
        includingStatus: true,
        clearPartialState: true,
      })
    }

    return result || false
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
    this.repositoryStateCache.updateChangesState(repository, state => {
      const newFiles = state.workingDirectory.files.map(f =>
        f.id === file.id ? f.withSelection(selection) : f
      )

      const workingDirectory = WorkingDirectoryStatus.fromFiles(newFiles)

      return { workingDirectory }
    })

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _changeIncludeAllFiles(
    repository: Repository,
    includeAll: boolean
  ): Promise<void> {
    this.repositoryStateCache.updateChangesState(repository, state => {
      const workingDirectory = state.workingDirectory.withIncludeAllFiles(
        includeAll
      )
      return { workingDirectory }
    })

    this.emitUpdate()

    return Promise.resolve()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _refreshOrRecoverRepository(
    repository: Repository
  ): Promise<void> {
    // if repository is missing, try checking if it has been restored
    if (repository.missing) {
      const updatedRepository = await this.recoverMissingRepository(repository)
      if (!updatedRepository.missing) {
        // repository has been restored, attempt to refresh it now.
        return this._refreshRepository(updatedRepository)
      }
    } else {
      return this._refreshRepository(repository)
    }
  }

  private async recoverMissingRepository(
    repository: Repository
  ): Promise<Repository> {
    /*
        if the repository is marked missing, check to see if the file path exists,
        and if so then see if git recognizes the path as a valid repository,
        and if so, reset the missing status as its been restored
      */
    if (
      repository.missing
        ? (await pathExists(repository.path))
          ? await isGitRepository(repository.path)
          : false
        : false
    ) {
      return this._updateRepositoryMissing(repository, false)
    } else {
      return repository
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _refreshRepository(repository: Repository): Promise<void> {
    if (repository.missing) {
      return
    }

    // if the repository path doesn't exist on disk,
    // set the flag and don't try anything Git-related
    const exists = await pathExists(repository.path)
    if (!exists) {
      this._updateRepositoryMissing(repository, true)
      return
    }

    const state = this.repositoryStateCache.get(repository)
    const gitStore = this.gitStoreCache.get(repository)

    // if we cannot get a valid status it's a good indicator that the repository
    // is in a bad state - let's mark it as missing here and give up on the
    // further work
    const status = await this._loadStatus(repository)
    if (!status) {
      await this._updateRepositoryMissing(repository, true)
      return
    }

    await gitStore.loadBranches()

    const section = state.selectedSection
    let refreshSectionPromise: Promise<void>

    if (section === RepositorySectionTab.History) {
      refreshSectionPromise = this.refreshHistorySection(repository)
    } else if (section === RepositorySectionTab.Changes) {
      refreshSectionPromise = this.refreshChangesSection(repository, {
        includingStatus: false,
        clearPartialState: false,
      })
    } else {
      return assertNever(section, `Unknown section: ${section}`)
    }

    await Promise.all([
      gitStore.loadRemotes(),
      gitStore.updateLastFetched(),
      this.refreshAuthor(repository),
      refreshSectionPromise,
    ])

    this._updateCurrentPullRequest(repository)
    this.updateMenuItemLabels(repository)
    this._initializeCompare(repository)
    this.refreshIndicatorsForRepositories([repository], false)
  }

  public refreshAllIndicators() {
    return this.refreshIndicatorsForRepositories(this.repositories, true)
  }

  /**
   * Refresh in-memory indicators for a set of repositories
   *
   * @param repositories the set of repositories to update
   * @param tryBackgroundFetch whether the action should also try and fetch new changes from the remote
   */
  private async refreshIndicatorsForRepositories(
    repositories: ReadonlyArray<Repository>,
    tryBackgroundFetch: boolean
  ): Promise<void> {
    const startTime = performance && performance.now ? performance.now() : null

    for (const repo of repositories) {
      await this.refreshIndicatorForRepository(repo, tryBackgroundFetch)
    }

    if (startTime && repositories.length > 1) {
      const delta = performance.now() - startTime
      const timeInSeconds = (delta / 1000).toFixed(3)
      log.info(
        `Background fetch for ${
          repositories.length
        } repositories took ${timeInSeconds}sec`
      )
    }

    this.emitUpdate()
  }

  /**
   * Refresh in-memory indicators for a repository
   *
   * @param repository the repository to check and update
   * @param tryBackgroundFetch whether the action should also try and fetch new changes from the remote
   */
  private async refreshIndicatorForRepository(
    repository: Repository,
    tryBackgroundFetch: boolean
  ) {
    const lookup = this.localRepositoryStateLookup

    if (repository.missing) {
      lookup.delete(repository.id)
      return
    }

    const exists = await pathExists(repository.path)
    if (!exists) {
      lookup.delete(repository.id)
      return
    }

    const gitStore = this.gitStoreCache.get(repository)
    const status = await gitStore.loadStatus()
    if (status === null) {
      lookup.delete(repository.id)
      return
    }

    if (tryBackgroundFetch) {
      const lastPush = await inferLastPushForRepository(
        this.accounts,
        gitStore,
        repository
      )

      if (this.shouldBackgroundFetch(repository, lastPush)) {
        await this._fetch(repository, FetchType.BackgroundTask)
      }
    }

    lookup.set(repository.id, {
      aheadBehind: gitStore.aheadBehind,
      changedFilesCount: status.workingDirectory.files.length,
    })
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

    const gitStore = this.gitStoreCache.get(repository)
    const state = this.repositoryStateCache.get(repository)

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
    const gitStore = this.gitStoreCache.get(repository)
    const state = this.repositoryStateCache.get(repository)
    const tip = state.branchesState.tip

    if (tip.kind === TipState.Valid) {
      await gitStore.loadLocalCommits(tip.branch)
    }

    return this.updateOrSelectFirstCommit(
      repository,
      state.compareState.commitSHAs
    )
  }

  private async refreshAuthor(repository: Repository): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)
    const commitAuthor =
      (await gitStore.performFailableOperation(() =>
        getAuthorIdentity(repository)
      )) || null

    this.repositoryStateCache.update(repository, () => ({
      commitAuthor,
    }))
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
    if (currentPopup == null) {
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
  public async _closeCurrentFoldout(): Promise<void> {
    if (this.currentFoldout == null) {
      return
    }

    this.currentFoldout = null
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _closeFoldout(foldout: FoldoutType): Promise<void> {
    if (this.currentFoldout == null) {
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
    const gitStore = this.gitStoreCache.get(repository)
    const branch = await gitStore.performFailableOperation(() =>
      createBranch(repository, name, startPoint)
    )

    if (branch == null) {
      return repository
    }

    return await this._checkoutBranch(repository, branch)
  }

  private updateCheckoutProgress(
    repository: Repository,
    checkoutProgress: ICheckoutProgress | null
  ) {
    this.repositoryStateCache.update(repository, () => ({
      checkoutProgress,
    }))

    if (this.selectedRepository === repository) {
      this.emitUpdate()
    }
  }

  private getLocalBranch(
    repository: Repository,
    branch: string
  ): Branch | null {
    const gitStore = this.gitStoreCache.get(repository)
    return (
      gitStore.allBranches.find(b => b.nameWithoutRemote === branch) || null
    )
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _checkoutBranch(
    repository: Repository,
    branch: Branch | string
  ): Promise<Repository> {
    const gitStore = this.gitStoreCache.get(repository)
    const kind = 'checkout'

    const foundBranch =
      typeof branch === 'string'
        ? this.getLocalBranch(repository, branch)
        : branch

    if (foundBranch == null) {
      return repository
    }

    await this.withAuthenticatingUser(repository, (repository, account) =>
      gitStore.performFailableOperation(
        () =>
          checkoutBranch(repository, account, foundBranch, progress => {
            this.updateCheckoutProgress(repository, progress)
          }),
        {
          repository,
          retryAction: {
            type: RetryActionType.Checkout,
            repository,
            branch,
          },
        }
      )
    )

    try {
      this.updateCheckoutProgress(repository, {
        kind,
        title: __DARWIN__ ? 'Refreshing Repository' : 'Refreshing repository',
        value: 1,
        targetBranch: foundBranch.name,
      })

      await this._refreshRepository(repository)
    } finally {
      this.updateCheckoutProgress(repository, null)
      this._initializeCompare(repository, {
        kind: HistoryTabMode.History,
      })
    }

    const { branchesState } = this.repositoryStateCache.get(repository)
    const { defaultBranch } = branchesState

    if (defaultBranch !== null && foundBranch.name !== defaultBranch.name) {
      this.statsStore.recordNonDefaultBranchCheckout()
    }

    return repository
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  private async repositoryWithRefreshedGitHubRepository(
    repository: Repository
  ): Promise<Repository> {
    const oldGitHubRepository = repository.gitHubRepository

    const matchedGitHubRepository = await this.matchGitHubRepository(repository)
    if (!matchedGitHubRepository) {
      // TODO: We currently never clear GitHub repository associations (see
      // https://github.com/desktop/desktop/issues/1144). So we can bail early
      // at this point.
      return repository
    }

    // This is the repository with the GitHub repository as matched. It's not
    // ideal because the GitHub repository hasn't been fetched from the API yet
    // and so it is incomplete. But if we _can't_ fetch it from the API, it's
    // better than nothing.
    const skeletonOwner = new Owner(
      matchedGitHubRepository.owner,
      matchedGitHubRepository.endpoint,
      null
    )
    const skeletonGitHubRepository = new GitHubRepository(
      matchedGitHubRepository.name,
      skeletonOwner,
      null
    )
    const skeletonRepository = new Repository(
      repository.path,
      repository.id,
      skeletonGitHubRepository,
      repository.missing
    )

    const account = getAccountForEndpoint(
      this.accounts,
      matchedGitHubRepository.endpoint
    )
    if (!account) {
      // If the repository given to us had a GitHubRepository instance we want
      // to try to preserve that if possible since the updated GitHubRepository
      // instance won't have any API information while the previous one might.
      // We'll only swap it out if the endpoint has changed in which case the
      // old API information will be invalid anyway.
      if (
        !oldGitHubRepository ||
        matchedGitHubRepository.endpoint !== oldGitHubRepository.endpoint
      ) {
        return skeletonRepository
      }

      return repository
    }

    const api = API.fromAccount(account)
    const apiRepo = await api.fetchRepository(
      matchedGitHubRepository.owner,
      matchedGitHubRepository.name
    )

    if (!apiRepo) {
      // This is the same as above. If the request fails, we wanna preserve the
      // existing GitHub repository info. But if we didn't have a GitHub
      // repository already or the endpoint changed, the skeleton repository is
      // better than nothing.
      if (
        !oldGitHubRepository ||
        matchedGitHubRepository.endpoint !== oldGitHubRepository.endpoint
      ) {
        return skeletonRepository
      }

      return repository
    }

    const endpoint = matchedGitHubRepository.endpoint
    return this.repositoriesStore.updateGitHubRepository(
      repository,
      endpoint,
      apiRepo
    )
  }

  private async matchGitHubRepository(
    repository: Repository
  ): Promise<IMatchedGitHubRepository | null> {
    const gitStore = this.gitStoreCache.get(repository)
    const remote = gitStore.defaultRemote
    return remote !== null
      ? matchGitHubRepository(this.accounts, remote.url)
      : null
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
    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.performFailableOperation(() =>
      renameBranch(repository, branch, newName)
    )

    return this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _deleteBranch(
    repository: Repository,
    branch: Branch,
    includeRemote: boolean
  ): Promise<void> {
    return this.withAuthenticatingUser(repository, async (r, account) => {
      const { branchesState } = this.repositoryStateCache.get(r)
      const { defaultBranch } = branchesState

      if (defaultBranch == null) {
        throw new Error(
          `A default branch cannot be found for this repository, so the app is unable to identify which branch to switch to before removing the current branch.`
        )
      }

      const gitStore = this.gitStoreCache.get(r)

      await gitStore.performFailableOperation(() =>
        checkoutBranch(r, account, defaultBranch)
      )
      await gitStore.performFailableOperation(() =>
        deleteBranch(r, branch, account, includeRemote)
      )

      return this._refreshRepository(r)
    })
  }

  private updatePushPullFetchProgress(
    repository: Repository,
    pushPullFetchProgress: Progress | null
  ) {
    this.repositoryStateCache.update(repository, () => ({
      pushPullFetchProgress,
    }))

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
    const state = this.repositoryStateCache.get(repository)
    const { remote } = state
    if (remote === null) {
      this._showPopup({
        type: PopupType.PublishRepository,
        repository,
      })

      return
    }

    return this.withPushPullFetch(repository, async () => {
      const { tip } = state.branchesState

      if (tip.kind === TipState.Unborn) {
        throw new Error('The current branch is unborn.')
      }

      if (tip.kind === TipState.Detached) {
        throw new Error('The current repository is in a detached HEAD state.')
      }

      if (tip.kind === TipState.Valid) {
        const { branch } = tip

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
        const scale = (1 / (pushWeight + fetchWeight)) * (1 - refreshWeight)

        pushWeight *= scale
        fetchWeight *= scale

        const retryAction: RetryAction = {
          type: RetryActionType.Push,
          repository,
        }

        const gitStore = this.gitStoreCache.get(repository)
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

        const prUpdater = this.currentPullRequestUpdater
        if (prUpdater) {
          const state = this.repositoryStateCache.get(repository)
          const currentPR = state.branchesState.currentPullRequest
          const gitHubRepository = repository.gitHubRepository

          if (currentPR && gitHubRepository) {
            prUpdater.didPushPullRequest(currentPR)
          }
        }

        const { accounts } = this.getState()
        const githubAccount = await findAccountForRemoteURL(
          remote.url,
          accounts
        )

        if (githubAccount === null) {
          this.statsStore.recordPushToGenericRemote()
        } else if (githubAccount.endpoint === getDotComAPIEndpoint()) {
          this.statsStore.recordPushToGitHub()
        } else if (
          githubAccount.endpoint === getEnterpriseAPIURL(githubAccount.endpoint)
        ) {
          this.statsStore.recordPushToGitHubEnterprise()
        }
      }
    })
  }

  private async isCommitting(
    repository: Repository,
    fn: () => Promise<string | undefined>
  ): Promise<boolean | undefined> {
    const state = this.repositoryStateCache.get(repository)
    // ensure the user doesn't try and commit again
    if (state.isCommitting) {
      return
    }

    this.repositoryStateCache.update(repository, () => ({
      isCommitting: true,
    }))
    this.emitUpdate()

    try {
      const sha = await fn()
      return sha !== undefined
    } finally {
      this.repositoryStateCache.update(repository, () => ({
        isCommitting: false,
      }))
      this.emitUpdate()
    }
  }

  private async withPushPullFetch(
    repository: Repository,
    fn: () => Promise<void>
  ): Promise<void> {
    const state = this.repositoryStateCache.get(repository)
    // Don't allow concurrent network operations.
    if (state.isPushPullFetchInProgress) {
      return
    }

    this.repositoryStateCache.update(repository, () => ({
      isPushPullFetchInProgress: true,
    }))
    this.emitUpdate()

    try {
      await fn()
    } finally {
      this.repositoryStateCache.update(repository, () => ({
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
    return this.withPushPullFetch(repository, async () => {
      const gitStore = this.gitStoreCache.get(repository)
      const remote = gitStore.currentRemote

      if (!remote) {
        throw new Error('The repository has no remotes.')
      }

      const state = this.repositoryStateCache.get(repository)
      const tip = state.branchesState.tip

      if (tip.kind === TipState.Unborn) {
        throw new Error('The current branch is unborn.')
      }

      if (tip.kind === TipState.Detached) {
        throw new Error('The current repository is in a detached HEAD state.')
      }

      if (tip.kind === TipState.Valid) {
        let mergeBase: string | null = null
        let gitContext: MergeConflictsErrorContext | undefined = undefined

        if (tip.branch.upstream !== null) {
          mergeBase = await getMergeBase(
            repository,
            tip.branch.name,
            tip.branch.upstream
          )

          gitContext = { kind: 'pull', tip, theirBranch: tip.branch.upstream }
        }

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
          const scale = (1 / (pullWeight + fetchWeight)) * (1 - refreshWeight)

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
            {
              gitContext,
              retryAction,
            }
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

          if (mergeBase) {
            await gitStore.reconcileHistory(mergeBase)
          }

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
    const state = this.repositoryStateCache.get(repository)
    const branches = state.branchesState.allBranches

    const tip = state.branchesState.tip
    const currentBranchName =
      tip.kind === TipState.Valid ? tip.branch.name : null

    let eligibleBranches = branches.filter(b =>
      eligibleForFastForward(b, currentBranchName)
    )

    if (eligibleBranches.length >= FastForwardBranchesThreshold) {
      log.info(
        `skipping fast-forward for all branches as there are ${
          eligibleBranches.length
        } local branches - this will run again when there are less than ${FastForwardBranchesThreshold} local branches tracking remotes`
      )

      const defaultBranch = state.branchesState.defaultBranch
      eligibleBranches =
        defaultBranch != null &&
        eligibleForFastForward(defaultBranch, currentBranchName)
          ? [defaultBranch]
          : []
    }

    for (const branch of eligibleBranches) {
      const aheadBehind = await getBranchAheadBehind(repository, branch)
      if (!aheadBehind) {
        continue
      }

      const { ahead, behind } = aheadBehind
      // Only perform the fast forward if the branch is behind it's upstream
      // branch and has no local commits.
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

    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.performFailableOperation(() =>
      addRemote(repository, 'origin', apiRepository.clone_url)
    )
    await gitStore.loadRemotes()

    // skip pushing if the current branch is a detached HEAD or the repository
    // is unborn
    if (gitStore.tip.kind === TipState.Valid) {
      await this.performPush(repository, account)
    }

    return this.repositoryWithRefreshedGitHubRepository(repository)
  }

  private getAccountForRemoteURL(remote: string): IGitAccount | null {
    const gitHubRepository = matchGitHubRepository(this.accounts, remote)
    if (gitHubRepository) {
      const account = getAccountForEndpoint(
        this.accounts,
        gitHubRepository.endpoint
      )
      if (account) {
        const hasValidToken =
          account.token.length > 0 ? 'has token' : 'empty token'
        log.info(
          `[AppStore.getAccountForRemoteURL] account found for remote: ${remote} - ${
            account.login
          } (${hasValidToken})`
        )
        return account
      }
    }

    const hostname = getGenericHostname(remote)
    const username = getGenericUsername(hostname)
    if (username != null) {
      log.info(
        `[AppStore.getAccountForRemoteURL] found generic credentials for '${hostname}' and '${username}'`
      )
      return { login: username, endpoint: hostname }
    }

    log.info(
      `[AppStore.getAccountForRemoteURL] no generic credentials found for '${remote}'`
    )

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

    promise.then(success => {
      if (success) {
        this.statsStore.recordCloneRepository()
      }
    })

    return { promise, repository }
  }

  public _removeCloningRepository(repository: CloningRepository) {
    this.cloningRepositoriesStore.remove(repository)
  }

  public async _discardChanges(
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ) {
    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.discardChanges(files)

    return this._refreshRepository(repository)
  }

  public async _undoCommit(
    repository: Repository,
    commit: Commit
  ): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)

    await gitStore.undoCommit(commit)

    const { commitSelection } = this.repositoryStateCache.get(repository)

    if (commitSelection.sha === commit.sha) {
      this.clearSelectedCommit(repository)
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
        const gitStore = this.gitStoreCache.get(repository)
        await gitStore.fetchRefspec(account, refspec)

        return this._refreshRepository(repository)
      }
    )
  }

  /**
   * Fetch all relevant remotes in the the repository.
   *
   * See gitStore.fetch for more details.
   *
   * Note that this method will not perform the fetch of the specified remote
   * if _any_ fetches or pulls are currently in-progress.
   */
  public _fetch(repository: Repository, fetchType: FetchType): Promise<void> {
    return this.withAuthenticatingUser(repository, (repository, account) => {
      return this.performFetch(repository, account, fetchType)
    })
  }

  /**
   * Fetch a particular remote in a repository.
   *
   * Note that this method will not perform the fetch of the specified remote
   * if _any_ fetches or pulls are currently in-progress.
   */
  private _fetchRemote(
    repository: Repository,
    remote: IRemote,
    fetchType: FetchType
  ): Promise<void> {
    return this.withAuthenticatingUser(repository, (repository, account) => {
      return this.performFetch(repository, account, fetchType, [remote])
    })
  }

  /**
   * Fetch all relevant remotes or one or more given remotes in the repository.
   *
   * @param remotes Optional, one or more remotes to fetch if undefined all
   *                relevant remotes will be fetched. See gitStore.fetch for
   *                more detail on what constitutes a relevant remote.
   */
  private async performFetch(
    repository: Repository,
    account: IGitAccount | null,
    fetchType: FetchType,
    remotes?: IRemote[]
  ): Promise<void> {
    await this.withPushPullFetch(repository, async () => {
      const gitStore = this.gitStoreCache.get(repository)

      try {
        const fetchWeight = 0.9
        const refreshWeight = 0.1
        const isBackgroundTask = fetchType === FetchType.BackgroundTask

        const progressCallback = (progress: IFetchProgress) => {
          this.updatePushPullFetchProgress(repository, {
            ...progress,
            value: progress.value * fetchWeight,
          })
        }

        if (remotes === undefined) {
          await gitStore.fetch(account, isBackgroundTask, progressCallback)
        } else {
          await gitStore.fetchRemotes(
            account,
            remotes,
            isBackgroundTask,
            progressCallback
          )
        }

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

        if (fetchType === FetchType.UserInitiatedTask) {
          this._refreshPullRequests(repository)
          if (repository.gitHubRepository != null) {
            this._refreshIssues(repository.gitHubRepository)
          }
        }
      }
    })
  }

  public _endWelcomeFlow(): Promise<void> {
    this.showWelcomeFlow = false
    this.emitUpdate()

    markWelcomeFlowComplete()

    this.statsStore.recordWelcomeWizardTerminated()

    return Promise.resolve()
  }

  public _setCommitMessageFocus(focus: boolean) {
    if (this.focusCommitMessage !== focus) {
      this.focusCommitMessage = focus
      this.emitUpdate()
    }
  }

  public _setSidebarWidth(width: number): Promise<void> {
    this.sidebarWidth = width
    setNumber(sidebarWidthConfigKey, width)
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
    setNumber(commitSummaryWidthConfigKey, width)
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
    message: ICommitMessage
  ): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)
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
    branch: string,
    mergeStatus: MergeResultStatus | null
  ): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)

    if (mergeStatus !== null) {
      if (mergeStatus.kind === MergeResultKind.Clean) {
        this.statsStore.recordMergeHintSuccessAndUserProceeded()
      } else if (mergeStatus.kind === MergeResultKind.Conflicts) {
        this.statsStore.recordUserProceededAfterConflictWarning()
      } else if (mergeStatus.kind === MergeResultKind.Loading) {
        this.statsStore.recordUserProceededWhileLoading()
      }
    }

    const mergeSuccessful = await gitStore.merge(branch)
    const { tip } = gitStore

    if (mergeSuccessful && tip.kind === TipState.Valid) {
      this._setSuccessfulMergeBannerState({
        ourBranch: tip.branch.name,
        theirBranch: branch,
      })
    }

    return this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _abortMerge(repository: Repository): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)
    return await gitStore.performFailableOperation(() => abortMerge(repository))
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _finishConflictedMerge(
    repository: Repository,
    workingDirectory: WorkingDirectoryStatus
  ): Promise<string | undefined> {
    // filter out untracked files so we don't commit them
    const trackedFiles = workingDirectory.files.filter(f => {
      return f.status.kind !== AppFileStatusKind.Untracked
    })
    const gitStore = this.gitStoreCache.get(repository)
    return await gitStore.performFailableOperation(() =>
      createMergeCommit(repository, trackedFiles)
    )
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _setRemoteURL(
    repository: Repository,
    name: string,
    url: string
  ): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)
    return gitStore.setRemoteURL(name, url)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _openShell(path: string) {
    this.statsStore.recordOpenShell()

    try {
      const match = await findShellOrDefault(this.selectedShell)
      await launchShell(match, path, error => this._pushError(error))
    } catch (error) {
      this.emitError(error)
    }
  }

  /** Takes a URL and opens it using the system default application */
  public _openInBrowser(url: string): Promise<boolean> {
    return shell.openExternal(url)
  }

  /** Open a path to a repository or file using the user's configured editor */
  public async _openInExternalEditor(fullPath: string): Promise<void> {
    const { selectedExternalEditor } = this.getState()

    try {
      const match = await findEditorOrDefault(selectedExternalEditor)
      if (match === null) {
        this.emitError(
          new ExternalEditorError(
            'No suitable editors installed for GitHub Desktop to launch. Install Atom for your platform and restart GitHub Desktop to try again.',
            { suggestAtom: true }
          )
        )
        return
      }

      await launchExternalEditor(fullPath, match)
    } catch (error) {
      this.emitError(error)
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _saveGitIgnore(
    repository: Repository,
    text: string
  ): Promise<void> {
    await saveGitIgnore(repository, text)
    return this._refreshRepository(repository)
  }

  /** Has the user opted out of stats reporting? */
  public getStatsOptOut(): boolean {
    return this.statsStore.getOptOut()
  }

  /** Set whether the user has opted out of stats reporting. */
  public async setStatsOptOut(
    optOut: boolean,
    userViewedPrompt: boolean
  ): Promise<void> {
    await this.statsStore.setOptOut(optOut, userViewedPrompt)

    this.emitUpdate()
  }

  public markUsageStatsNoteSeen() {
    markUsageStatsNoteSeen()
  }

  public _setConfirmRepositoryRemovalSetting(
    confirmRepoRemoval: boolean
  ): Promise<void> {
    this.confirmRepoRemoval = confirmRepoRemoval
    setBoolean(confirmRepoRemovalKey, confirmRepoRemoval)
    this.emitUpdate()

    return Promise.resolve()
  }

  public _setConfirmDiscardChangesSetting(value: boolean): Promise<void> {
    this.confirmDiscardChanges = value

    setBoolean(confirmDiscardChangesKey, value)
    this.emitUpdate()

    return Promise.resolve()
  }

  public _setExternalEditor(selectedEditor: ExternalEditor): Promise<void> {
    this.selectedExternalEditor = selectedEditor
    localStorage.setItem(externalEditorKey, selectedEditor)
    this.emitUpdate()

    this.updateMenuItemLabels()

    return Promise.resolve()
  }

  public _setShell(shell: Shell): Promise<void> {
    this.selectedShell = shell
    localStorage.setItem(shellKey, shell)
    this.emitUpdate()

    this.updateMenuItemLabels()

    return Promise.resolve()
  }

  public _changeImageDiffType(type: ImageDiffType): Promise<void> {
    this.imageDiffType = type
    localStorage.setItem(imageDiffTypeKey, JSON.stringify(this.imageDiffType))
    this.emitUpdate()

    return Promise.resolve()
  }

  public _setUpdateBannerVisibility(visibility: boolean) {
    this.isUpdateAvailableBannerVisible = visibility

    this.emitUpdate()
  }

  public _setSuccessfulMergeBannerState(state: SuccessfulMergeBannerState) {
    this.successfulMergeBannerState = state

    this.emitUpdate()
  }

  public _setMergeConflictsBannerState(state: MergeConflictsBannerState) {
    this.mergeConflictsBannerState = state

    this.emitUpdate()
  }

  public _setDivergingBranchBannerVisibility(
    repository: Repository,
    visible: boolean
  ) {
    const state = this.repositoryStateCache.get(repository)
    const { compareState } = state

    if (compareState.isDivergingBranchBannerVisible !== visible) {
      this.repositoryStateCache.updateCompareState(repository, () => ({
        isDivergingBranchBannerVisible: visible,
      }))

      if (visible) {
        this.statsStore.recordDivergingBranchBannerDisplayed()
      }

      this.emitUpdate()
    }
  }

  public _reportStats() {
    // ensure the user has seen and acknowledged the current usage stats setting
    if (!this.showWelcomeFlow && !hasSeenUsageStatsNote()) {
      this._showPopup({ type: PopupType.UsageReportingChanges })
      return Promise.resolve()
    }

    return this.statsStore.reportStats(this.accounts, this.repositories)
  }

  public _recordLaunchStats(stats: ILaunchStats): Promise<void> {
    return this.statsStore.recordLaunchStats(stats)
  }

  public async _appendIgnoreRule(
    repository: Repository,
    pattern: string | string[]
  ): Promise<void> {
    await appendIgnoreRule(repository, pattern)
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

  public async _setAppFocusState(isFocused: boolean): Promise<void> {
    if (this.appIsFocused !== isFocused) {
      this.appIsFocused = isFocused
      this.emitUpdate()
    }
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
    log.info(
      `[AppStore] removing account ${account.login} (${
        account.name
      }) from store`
    )
    return this.accountsStore.removeAccount(account)
  }

  public async _addAccount(account: Account): Promise<void> {
    log.info(
      `[AppStore] adding account ${account.login} (${account.name}) to store`
    )
    await this.accountsStore.addAccount(account)
    const selectedState = this.getState().selectedState

    if (selectedState && selectedState.type === SelectionType.Repository) {
      // ensuring we have the latest set of accounts here, rather than waiting
      // and doing stuff when the account store emits an update and we refresh
      // the accounts field
      const accounts = await this.accountsStore.getAll()
      const repoState = selectedState.state
      const commits = repoState.commitLookup.values()
      this.loadAndCacheUsers(selectedState.repository, accounts, commits)
    }

    // If we're in the welcome flow and a user signs in we want to trigger
    // a refresh of the repositories available for cloning straight away
    // in order to have the list of repositories ready for them when they
    // get to the blankslate.
    if (this.showWelcomeFlow) {
      this.apiRepositoriesStore.loadRepositories(account)
    }
  }

  private loadAndCacheUsers(
    repository: Repository,
    accounts: ReadonlyArray<Account>,
    commits: Iterable<Commit>
  ) {
    for (const commit of commits) {
      this.gitHubUserStore._loadAndCacheUser(
        accounts,
        repository,
        commit.sha,
        commit.author.email
      )
    }
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
    const lfsRepositories = new Array<Repository>()
    for (const path of paths) {
      const validatedPath = await validatedRepositoryPath(path)
      if (validatedPath) {
        log.info(`[AppStore] adding repository at ${validatedPath} to store`)

        const addedRepo = await this.repositoriesStore.addRepository(
          validatedPath
        )

        // initialize the remotes for this new repository to ensure it can fetch
        // it's GitHub-related details using the GitHub API (if applicable)
        const gitStore = this.gitStoreCache.get(addedRepo)
        await gitStore.loadRemotes()

        const [refreshedRepo, usingLFS] = await Promise.all([
          this.repositoryWithRefreshedGitHubRepository(addedRepo),
          this.isUsingLFS(addedRepo),
        ])
        addedRepositories.push(refreshedRepo)

        if (usingLFS) {
          lfsRepositories.push(refreshedRepo)
        }
      } else {
        const error = new Error(`${path} isn't a git repository.`)
        this.emitError(error)
      }
    }

    if (lfsRepositories.length > 0) {
      this._showPopup({
        type: PopupType.InitializeLFS,
        repositories: lfsRepositories,
      })
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

    const allRepositories = await this.repositoriesStore.getAll()
    if (allRepositories.length === 0) {
      this._closeFoldout(FoldoutType.Repository)
    } else {
      this._showFoldout({ type: FoldoutType.Repository })
    }
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
    let account: IGitAccount | null = getAccountForRepository(
      this.accounts,
      updatedRepository
    )

    // If we don't have a user association, it might be because we haven't yet
    // tried to associate the repository with a GitHub repository, or that
    // association is out of date. So try again before we bail on providing an
    // authenticating user.
    if (!account) {
      updatedRepository = await this.repositoryWithRefreshedGitHubRepository(
        repository
      )
      account = getAccountForRepository(this.accounts, updatedRepository)
    }

    if (!account) {
      const gitStore = this.gitStoreCache.get(repository)
      const remote = gitStore.currentRemote
      if (remote) {
        const hostname = getGenericHostname(remote.url)
        const username = getGenericUsername(hostname)
        if (username != null) {
          account = { login: username, endpoint: hostname }
        }
      }
    }

    if (account instanceof Account) {
      const hasValidToken =
        account.token.length > 0 ? 'has token' : 'empty token'
      log.info(
        `[AppStore.withAuthenticatingUser] account found for repository: ${
          repository.name
        } - ${account.login} (${hasValidToken})`
      )
    }

    return fn(updatedRepository, account)
  }

  private updateRevertProgress(
    repository: Repository,
    progress: IRevertProgress | null
  ) {
    this.repositoryStateCache.update(repository, () => ({
      revertProgress: progress,
    }))

    if (this.selectedRepository === repository) {
      this.emitUpdate()
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _revertCommit(
    repository: Repository,
    commit: Commit
  ): Promise<void> {
    return this.withAuthenticatingUser(repository, async (repo, account) => {
      const gitStore = this.gitStoreCache.get(repo)

      await gitStore.revertCommit(repo, commit, account, progress => {
        this.updateRevertProgress(repo, progress)
      })

      this.updateRevertProgress(repo, null)
      await this._refreshRepository(repository)
    })
  }

  public async promptForGenericGitAuthentication(
    repository: Repository | CloningRepository,
    retryAction: RetryAction
  ): Promise<void> {
    let url
    if (repository instanceof Repository) {
      const gitStore = this.gitStoreCache.get(repository)
      const remote = gitStore.currentRemote
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

  public async _installGlobalLFSFilters(force: boolean): Promise<void> {
    try {
      await installGlobalLFSFilters(force)
    } catch (error) {
      this.emitError(error)
    }
  }

  private async isUsingLFS(repository: Repository): Promise<boolean> {
    try {
      return await isUsingLFS(repository)
    } catch (error) {
      return false
    }
  }

  public async _installLFSHooks(
    repositories: ReadonlyArray<Repository>
  ): Promise<void> {
    for (const repo of repositories) {
      try {
        // At this point we've asked the user if we should install them, so
        // force installation.
        await installLFSHooks(repo, true)
      } catch (error) {
        this.emitError(error)
      }
    }
  }

  public _changeCloneRepositoriesTab(tab: CloneRepositoryTab): Promise<void> {
    this.selectedCloneRepositoryTab = tab

    this.emitUpdate()

    return Promise.resolve()
  }

  /**
   * Request a refresh of the list of repositories that
   * the provided account has explicit permissions to access.
   * See ApiRepositoriesStore for more details.
   */
  public _refreshApiRepositories(account: Account) {
    return this.apiRepositoriesStore.loadRepositories(account)
  }

  public _openMergeTool(repository: Repository, path: string): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)
    return gitStore.openMergeTool(path)
  }

  public _changeBranchesTab(tab: BranchesTab): Promise<void> {
    this.selectedBranchesTab = tab

    this.emitUpdate()

    return Promise.resolve()
  }

  public async _createPullRequest(repository: Repository): Promise<void> {
    const gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) {
      return
    }

    const state = this.repositoryStateCache.get(repository)
    const tip = state.branchesState.tip

    if (tip.kind !== TipState.Valid) {
      return
    }

    const branch = tip.branch
    const aheadBehind = state.aheadBehind

    if (aheadBehind == null) {
      this._showPopup({
        type: PopupType.PushBranchCommits,
        repository,
        branch,
      })
    } else if (aheadBehind.ahead > 0) {
      this._showPopup({
        type: PopupType.PushBranchCommits,
        repository,
        branch,
        unPushedCommits: aheadBehind.ahead,
      })
    } else {
      await this._openCreatePullRequestInBrowser(repository, branch)
    }
  }

  public async _showPullRequest(repository: Repository): Promise<void> {
    const gitHubRepository = repository.gitHubRepository

    if (!gitHubRepository) {
      return
    }

    const state = this.repositoryStateCache.get(repository)
    const currentPullRequest = state.branchesState.currentPullRequest

    if (!currentPullRequest) {
      return
    }

    const baseURL = `${gitHubRepository.htmlURL}/pull/${
      currentPullRequest.pullRequestNumber
    }`

    await this._openInBrowser(baseURL)
  }

  private async loadPullRequests(
    repository: Repository,
    loader: (account: Account) => void
  ) {
    const gitHubRepository = repository.gitHubRepository

    if (gitHubRepository == null) {
      return
    }

    const account = getAccountForEndpoint(
      this.accounts,
      gitHubRepository.endpoint
    )

    if (account == null) {
      return
    }

    await loader(account)
  }

  public async _refreshPullRequests(repository: Repository): Promise<void> {
    return this.loadPullRequests(repository, async account => {
      await this.pullRequestStore.fetchAndCachePullRequests(repository, account)
      this.updateMenuItemLabels(repository)
    })
  }

  private async onPullRequestStoreUpdated(gitHubRepository: GitHubRepository) {
    const promiseForPRs = this.pullRequestStore.fetchPullRequestsFromCache(
      gitHubRepository
    )
    const isLoading = this.pullRequestStore.isFetchingPullRequests(
      gitHubRepository
    )

    const repository = this.repositories.find(
      r =>
        !!r.gitHubRepository &&
        r.gitHubRepository.dbID === gitHubRepository.dbID
    )
    if (!repository) {
      return
    }

    const prs = await promiseForPRs
    this.repositoryStateCache.updateBranchesState(repository, () => {
      return {
        openPullRequests: prs,
        isLoadingPullRequests: isLoading,
      }
    })

    this._updateCurrentPullRequest(repository)
    this.emitUpdate()
  }

  private findAssociatedPullRequest(
    branch: Branch,
    pullRequests: ReadonlyArray<PullRequest>,
    gitHubRepository: GitHubRepository,
    remote: IRemote
  ): PullRequest | null {
    const upstream = branch.upstreamWithoutRemote

    if (upstream == null) {
      return null
    }

    const pr =
      pullRequests.find(
        pr =>
          pr.head.ref === upstream &&
          pr.head.gitHubRepository != null &&
          repositoryMatchesRemote(pr.head.gitHubRepository, remote)
      ) || null

    return pr
  }

  private _updateCurrentPullRequest(repository: Repository) {
    const gitHubRepository = repository.gitHubRepository

    if (!gitHubRepository) {
      return
    }

    this.repositoryStateCache.updateBranchesState(repository, state => {
      let currentPullRequest: PullRequest | null = null

      const { remote } = this.repositoryStateCache.get(repository)

      if (state.tip.kind === TipState.Valid && remote) {
        currentPullRequest = this.findAssociatedPullRequest(
          state.tip.branch,
          state.openPullRequests,
          gitHubRepository,
          remote
        )
      }

      return {
        currentPullRequest,
      }
    })

    this.emitUpdate()
  }

  public async _openCreatePullRequestInBrowser(
    repository: Repository,
    branch: Branch
  ): Promise<void> {
    const gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) {
      return
    }

    const urlEncodedBranchName = escape(branch.nameWithoutRemote)
    const baseURL = `${
      gitHubRepository.htmlURL
    }/pull/new/${urlEncodedBranchName}`

    await this._openInBrowser(baseURL)
  }

  public async _updateExistingUpstreamRemote(
    repository: Repository
  ): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.updateExistingUpstreamRemote()

    return this._refreshRepository(repository)
  }

  private getIgnoreExistingUpstreamRemoteKey(repository: Repository): string {
    return `repository/${repository.id}/ignoreExistingUpstreamRemote`
  }

  public _ignoreExistingUpstreamRemote(repository: Repository): Promise<void> {
    const key = this.getIgnoreExistingUpstreamRemoteKey(repository)
    setBoolean(key, true)

    return Promise.resolve()
  }

  private getIgnoreExistingUpstreamRemote(
    repository: Repository
  ): Promise<boolean> {
    const key = this.getIgnoreExistingUpstreamRemoteKey(repository)
    return Promise.resolve(getBoolean(key, false))
  }

  private async addUpstreamRemoteIfNeeded(repository: Repository) {
    const gitStore = this.gitStoreCache.get(repository)
    const ignored = await this.getIgnoreExistingUpstreamRemote(repository)
    if (ignored) {
      return
    }

    return gitStore.addUpstreamRemoteIfNeeded()
  }

  public async _checkoutPullRequest(
    repository: Repository,
    pullRequest: PullRequest
  ): Promise<void> {
    const gitHubRepository = forceUnwrap(
      `Cannot checkout a PR if the repository doesn't have a GitHub repository`,
      repository.gitHubRepository
    )
    const head = pullRequest.head
    const isRefInThisRepo =
      head.gitHubRepository &&
      head.gitHubRepository.cloneURL === gitHubRepository.cloneURL

    if (isRefInThisRepo) {
      const gitStore = this.gitStoreCache.get(repository)
      const defaultRemote = gitStore.defaultRemote
      // if we don't have a default remote here, it's probably going
      // to just crash and burn on checkout, but that's okay
      if (defaultRemote != null) {
        // the remote ref will be something like `origin/my-cool-branch`
        const remoteRef = `${defaultRemote.name}/${head.ref}`

        const remoteRefExists =
          gitStore.allBranches.find(branch => branch.name === remoteRef) != null

        // only try a fetch here if we can't find the ref
        if (!remoteRefExists) {
          await this._fetchRemote(
            repository,
            defaultRemote,
            FetchType.UserInitiatedTask
          )
        }
      }
      await this._checkoutBranch(repository, head.ref)
    } else if (head.gitHubRepository != null) {
      const cloneURL = forceUnwrap(
        "This pull request's clone URL is not populated but should be",
        head.gitHubRepository.cloneURL
      )
      const remoteName = forkPullRequestRemoteName(
        head.gitHubRepository.owner.login
      )
      const remotes = await getRemotes(repository)
      const remote =
        remotes.find(r => r.name === remoteName) ||
        (await addRemote(repository, remoteName, cloneURL))

      if (remote.url !== cloneURL) {
        const error = new Error(
          `Expected PR remote ${remoteName} url to be ${cloneURL} got ${
            remote.url
          }.`
        )

        log.error(error.message)
        return this.emitError(error)
      }

      await this._fetchRemote(repository, remote, FetchType.UserInitiatedTask)

      const gitStore = this.gitStoreCache.get(repository)

      const localBranchName = `pr/${pullRequest.pullRequestNumber}`
      const doesBranchExist =
        gitStore.allBranches.find(branch => branch.name === localBranchName) !=
        null

      if (!doesBranchExist) {
        await this._createBranch(
          repository,
          localBranchName,
          `${remoteName}/${head.ref}`
        )
      }

      await this._checkoutBranch(repository, localBranchName)
    }

    this.statsStore.recordPRBranchCheckout()
  }

  /**
   * Set whether the user has chosen to hide or show the
   * co-authors field in the commit message component
   */
  public _setShowCoAuthoredBy(
    repository: Repository,
    showCoAuthoredBy: boolean
  ) {
    this.gitStoreCache.get(repository).setShowCoAuthoredBy(showCoAuthoredBy)
    return Promise.resolve()
  }

  /**
   * Update the per-repository co-authors list
   *
   * @param repository Co-author settings are per-repository
   * @param coAuthors  Zero or more authors
   */
  public _setCoAuthors(
    repository: Repository,
    coAuthors: ReadonlyArray<IAuthor>
  ) {
    this.gitStoreCache.get(repository).setCoAuthors(coAuthors)
    return Promise.resolve()
  }

  /**
   * Set the application-wide theme
   */
  public _setSelectedTheme(theme: ApplicationTheme) {
    setPersistedTheme(theme)
    this.selectedTheme = theme
    this.emitUpdate()

    return Promise.resolve()
  }

  /**
   * Set the application-wide theme
   */
  public _setAutomaticallySwitchTheme(automaticallySwitchTheme: boolean) {
    setAutoSwitchPersistedTheme(automaticallySwitchTheme)
    this.automaticallySwitchTheme = automaticallySwitchTheme
    this.emitUpdate()

    return Promise.resolve()
  }

  public async _resolveCurrentEditor() {
    const match = await findEditorOrDefault(this.selectedExternalEditor)
    const resolvedExternalEditor = match != null ? match.editor : null
    if (this.resolvedExternalEditor !== resolvedExternalEditor) {
      this.resolvedExternalEditor = resolvedExternalEditor
      this.emitUpdate()
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _updateManualConflictResolution(
    repository: Repository,
    path: string,
    manualResolution: ManualConflictResolution | null
  ) {
    this.repositoryStateCache.updateChangesState(repository, state => {
      const { conflictState } = state

      if (conflictState === null) {
        // not currently in a conflict, whatever
        return { conflictState }
      }

      const updatedManualResolutions = new Map(conflictState.manualResolutions)

      if (manualResolution !== null) {
        updatedManualResolutions.set(path, manualResolution)
      } else {
        updatedManualResolutions.delete(path)
      }

      return {
        conflictState: {
          ...conflictState,
          manualResolutions: updatedManualResolutions,
        },
      }
    })

    this.emitUpdate()
  }
}
/**
 * Map the cached state of the compare view to an action
 * to perform which is then used to compute the compare
 * view contents.
 */
function getInitialAction(
  cachedState: IDisplayHistory | ICompareBranch
): CompareAction {
  if (cachedState.kind === HistoryTabMode.History) {
    return {
      kind: HistoryTabMode.History,
    }
  }

  const { comparisonMode, comparisonBranch } = cachedState

  return {
    kind: HistoryTabMode.Compare,
    comparisonMode,
    branch: comparisonBranch,
  }
}

/**
 * Get the behind count (or 0) of the ahead/behind counter
 */
function getBehindOrDefault(aheadBehind: IAheadBehind | null): number {
  if (aheadBehind === null) {
    return 0
  }

  return aheadBehind.behind
}
