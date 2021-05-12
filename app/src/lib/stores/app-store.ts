import * as Path from 'path'
import { ipcRenderer, remote } from 'electron'
import { pathExists } from 'fs-extra'
import { escape } from 'querystring'
import {
  AccountsStore,
  CloningRepositoriesStore,
  GitHubUserStore,
  GitStore,
  IssuesStore,
  PullRequestCoordinator,
  RepositoriesStore,
  SignInStore,
} from '.'
import { Account } from '../../models/account'
import { AppMenu, IMenu } from '../../models/app-menu'
import { IAuthor } from '../../models/author'
import { Branch, BranchType, IAheadBehind } from '../../models/branch'
import { BranchesTab } from '../../models/branches-tab'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { CloningRepository } from '../../models/cloning-repository'
import { Commit, ICommitContext, CommitOneLine } from '../../models/commit'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
  ImageDiffType,
  ITextDiff,
} from '../../models/diff'
import { FetchType } from '../../models/fetch'
import {
  GitHubRepository,
  hasWritePermission,
} from '../../models/github-repository'
import { PullRequest } from '../../models/pull-request'
import {
  forkPullRequestRemoteName,
  IRemote,
  remoteEquals,
} from '../../models/remote'
import {
  ILocalRepositoryState,
  nameOf,
  Repository,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
  getNonForkGitHubRepository,
} from '../../models/repository'
import {
  CommittedFileChange,
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
  AppFileStatusKind,
} from '../../models/status'
import { TipState, tipEquals } from '../../models/tip'
import { ICommitMessage } from '../../models/commit-message'
import {
  Progress,
  ICheckoutProgress,
  IFetchProgress,
  IRevertProgress,
  IRebaseProgress,
  ICherryPickProgress,
} from '../../models/progress'
import { Popup, PopupType } from '../../models/popup'
import { IGitAccount } from '../../models/git-account'
import { themeChangeMonitor } from '../../ui/lib/theme-change-monitor'
import { getAppPath } from '../../ui/lib/app-proxy'
import {
  ApplicableTheme,
  ApplicationTheme,
  getCurrentlyAppliedTheme,
  getPersistedTheme,
  setPersistedTheme,
} from '../../ui/lib/application-theme'
import {
  getAppMenu,
  updatePreferredAppMenuItemLabels,
} from '../../ui/main-process-proxy'
import {
  API,
  getAccountForEndpoint,
  getDotComAPIEndpoint,
  IAPIOrganization,
  getEndpointForRepository,
  IAPIFullRepository,
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
  MergeConflictState,
  RebaseConflictState,
  IRebaseState,
  IRepositoryState,
  ChangesSelectionKind,
  ChangesWorkingDirectorySelection,
  isRebaseConflictState,
  isCherryPickConflictState,
  isMergeConflictState,
  CherryPickConflictState,
} from '../app-state'
import {
  findEditorOrDefault,
  getAvailableEditors,
  launchExternalEditor,
} from '../editors'
import { assertNever, fatalError } from '../fatal-error'

import { formatCommitMessage } from '../format-commit-message'
import { getGenericHostname, getGenericUsername } from '../generic-git-auth'
import { getAccountForRepository } from '../get-account-for-repository'
import {
  abortMerge,
  addRemote,
  checkoutBranch,
  createCommit,
  getAuthorIdentity,
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
  saveGitIgnore,
  appendIgnoreRule,
  createMergeCommit,
  getBranchesPointedAt,
  isGitRepository,
  abortRebase,
  continueRebase,
  rebase,
  PushOptions,
  RebaseResult,
  getRebaseSnapshot,
  IStatusResult,
  GitError,
  MergeResult,
  getBranchesDifferingFromUpstream,
  deleteLocalBranch,
  deleteRemoteBranch,
  fastForwardBranches,
  GitResetMode,
  reset,
  getBranchAheadBehind,
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
  matchExistingRepository,
  urlMatchesRemote,
} from '../repository-matching'
import {
  initializeRebaseFlowForConflictedRepository,
  formatRebaseValue,
  isCurrentBranchForcePush,
} from '../rebase'
import { RetryAction, RetryActionType } from '../../models/retry-actions'
import {
  Default as DefaultShell,
  findShellOrDefault,
  launchShell,
  parse as parseShell,
  Shell,
} from '../shells'
import { ILaunchStats, StatsStore } from '../stats'
import { hasShownWelcomeFlow, markWelcomeFlowComplete } from '../welcome'
import {
  getWindowState,
  WindowState,
  windowStateChannelName,
} from '../window-state'
import { TypedBaseStore } from './base-store'
import { MergeTreeResult } from '../../models/merge'
import { promiseWithMinimumTimeout, sleep } from '../promise'
import { BackgroundFetcher } from './helpers/background-fetcher'
import { validatedRepositoryPath } from './helpers/validated-repository-path'
import { RepositoryStateCache } from './repository-state-cache'
import { readEmoji } from '../read-emoji'
import { GitStoreCache } from './git-store-cache'
import { GitErrorContext } from '../git-error-context'
import {
  setNumber,
  setBoolean,
  getBoolean,
  getNumber,
  getNumberArray,
  setNumberArray,
  getEnum,
  getObject,
  setObject,
} from '../local-storage'
import { ExternalEditorError, suggestedExternalEditor } from '../editors/shared'
import { ApiRepositoriesStore } from './api-repositories-store'
import {
  updateChangedFiles,
  updateConflictState,
  selectWorkingDirectoryFiles,
} from './updates/changes-state'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { BranchPruner } from './helpers/branch-pruner'
import { enableHideWhitespaceInDiffOption } from '../feature-flag'
import { Banner, BannerType } from '../../models/banner'
import moment from 'moment'
import { ComputedAction } from '../../models/computed-action'
import {
  createDesktopStashEntry,
  getLastDesktopStashEntryForBranch,
  popStashEntry,
  dropDesktopStashEntry,
} from '../git/stash'
import {
  UncommittedChangesStrategy,
  defaultUncommittedChangesStrategy,
} from '../../models/uncommitted-changes-strategy'
import { IStashEntry, StashedChangesLoadStates } from '../../models/stash-entry'
import { RebaseFlowStep, RebaseStep } from '../../models/rebase-flow-step'
import { arrayEquals } from '../equality'
import { MenuLabelsEvent } from '../../models/menu-labels'
import { findRemoteBranchName } from './helpers/find-branch-name'
import { updateRemoteUrl } from './updates/update-remote-url'
import {
  TutorialStep,
  orderedTutorialSteps,
  isValidTutorialStep,
} from '../../models/tutorial-step'
import { OnboardingTutorialAssessor } from './helpers/tutorial-assessor'
import { getUntrackedFiles } from '../status'
import { enableProgressBarOnIcon } from '../feature-flag'
import { isBranchPushable } from '../helpers/push-control'
import {
  findAssociatedPullRequest,
  isPullRequestAssociatedWithBranch,
} from '../helpers/pull-request-matching'
import { parseRemote } from '../../lib/remote-parsing'
import { createTutorialRepository } from './helpers/create-tutorial-repository'
import { sendNonFatalException } from '../helpers/non-fatal-exception'
import { getDefaultDir } from '../../ui/lib/default-dir'
import { WorkflowPreferences } from '../../models/workflow-preferences'
import { RepositoryIndicatorUpdater } from './helpers/repository-indicator-updater'
import { getAttributableEmailsFor } from '../email'
import { TrashNameLabel } from '../../ui/lib/context-menu'
import { GitError as DugiteError } from 'dugite'
import { ErrorWithMetadata, CheckoutError } from '../error-with-metadata'
import {
  ShowSideBySideDiffDefault,
  getShowSideBySideDiff,
  setShowSideBySideDiff,
} from '../../ui/lib/diff-mode'
import {
  CherryPickFlowStep,
  CherryPickStepKind,
} from '../../models/cherry-pick'
import {
  abortCherryPick,
  cherryPick,
  CherryPickResult,
  continueCherryPick,
  getCherryPickSnapshot,
  isCherryPickHeadFound,
} from '../git/cherry-pick'
import { DragElement } from '../../models/drag-element'
import { ILastThankYou } from '../../models/last-thank-you'
import { squash } from '../git/squash'

const LastSelectedRepositoryIDKey = 'last-selected-repository-id'

const RecentRepositoriesKey = 'recently-selected-repositories'
/**
 *  maximum number of repositories shown in the "Recent" repositories group
 *  in the repository switcher dropdown
 */
const RecentRepositoriesLength = 3

const defaultSidebarWidth: number = 250
const sidebarWidthConfigKey: string = 'sidebar-width'

const defaultCommitSummaryWidth: number = 250
const commitSummaryWidthConfigKey: string = 'commit-summary-width'

const defaultStashedFilesWidth: number = 250
const stashedFilesWidthConfigKey: string = 'stashed-files-width'

const askToMoveToApplicationsFolderDefault: boolean = true
const confirmRepoRemovalDefault: boolean = true
const confirmDiscardChangesDefault: boolean = true
const askForConfirmationOnForcePushDefault = true
const askToMoveToApplicationsFolderKey: string = 'askToMoveToApplicationsFolder'
const confirmRepoRemovalKey: string = 'confirmRepoRemoval'
const confirmDiscardChangesKey: string = 'confirmDiscardChanges'
const confirmForcePushKey: string = 'confirmForcePush'

const uncommittedChangesStrategyKey = 'uncommittedChangesStrategyKind'

const externalEditorKey: string = 'externalEditor'

const imageDiffTypeDefault = ImageDiffType.TwoUp
const imageDiffTypeKey = 'image-diff-type'

const hideWhitespaceInChangesDiffDefault = false
const hideWhitespaceInChangesDiffKey = 'hide-whitespace-in-changes-diff'
const hideWhitespaceInHistoryDiffDefault = false
const hideWhitespaceInHistoryDiffKey = 'hide-whitespace-in-diff'

const commitSpellcheckEnabledDefault = true
const commitSpellcheckEnabledKey = 'commit-spellcheck-enabled'

const shellKey = 'shell'

const repositoryIndicatorsEnabledKey = 'enable-repository-indicators'

// background fetching should occur hourly when Desktop is active, but this
// lower interval ensures user interactions like switching repositories and
// switching between apps does not result in excessive fetching in the app
const BackgroundFetchMinimumInterval = 30 * 60 * 1000

/**
 * Wait 2 minutes before refreshing repository indicators
 */
const InitialRepositoryIndicatorTimeout = 2 * 60 * 1000

const MaxInvalidFoldersToDisplay = 3

const hasShownCherryPickIntroKey = 'has-shown-cherry-pick-intro'
const lastThankYouKey = 'version-and-users-of-last-thank-you'

export class AppStore extends TypedBaseStore<IAppState> {
  private readonly gitStoreCache: GitStoreCache

  private accounts: ReadonlyArray<Account> = new Array<Account>()
  private repositories: ReadonlyArray<Repository> = new Array<Repository>()
  private recentRepositories: ReadonlyArray<number> = new Array<number>()

  private selectedRepository: Repository | CloningRepository | null = null

  /** The background fetcher for the currently selected repository. */
  private currentBackgroundFetcher: BackgroundFetcher | null = null

  private currentBranchPruner: BranchPruner | null = null

  private readonly repositoryIndicatorUpdater: RepositoryIndicatorUpdater

  private showWelcomeFlow = false
  private focusCommitMessage = false
  private currentPopup: Popup | null = null
  private currentFoldout: Foldout | null = null
  private currentBanner: Banner | null = null
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
  private stashedFilesWidth: number = defaultStashedFilesWidth
  private windowState: WindowState
  private windowZoomFactor: number = 1
  private isUpdateAvailableBannerVisible: boolean = false

  private askToMoveToApplicationsFolderSetting: boolean = askToMoveToApplicationsFolderDefault
  private askForConfirmationOnRepositoryRemoval: boolean = confirmRepoRemovalDefault
  private confirmDiscardChanges: boolean = confirmDiscardChangesDefault
  private askForConfirmationOnForcePush = askForConfirmationOnForcePushDefault
  private imageDiffType: ImageDiffType = imageDiffTypeDefault
  private hideWhitespaceInChangesDiff: boolean = hideWhitespaceInChangesDiffDefault
  private hideWhitespaceInHistoryDiff: boolean = hideWhitespaceInHistoryDiffDefault
  /** Whether or not the spellchecker is enabled for commit summary and description */
  private commitSpellcheckEnabled: boolean = commitSpellcheckEnabledDefault
  private showSideBySideDiff: boolean = ShowSideBySideDiffDefault

  private uncommittedChangesStrategy = defaultUncommittedChangesStrategy

  private selectedExternalEditor: string | null = null

  private resolvedExternalEditor: string | null = null

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
  private selectedTheme = ApplicationTheme.System
  private currentTheme: ApplicableTheme = ApplicationTheme.Light

  private hasUserViewedStash = false

  private repositoryIndicatorsEnabled: boolean

  /** Which step the user needs to complete next in the onboarding tutorial */
  private currentOnboardingTutorialStep = TutorialStep.NotApplicable
  private readonly tutorialAssessor: OnboardingTutorialAssessor

  /**
   * Whether or not the user has been introduced to the cherry pick feature
   */
  private hasShownCherryPickIntro: boolean = false

  private currentDragElement: DragElement | null = null
  private lastThankYou: ILastThankYou | undefined

  public constructor(
    private readonly gitHubUserStore: GitHubUserStore,
    private readonly cloningRepositoriesStore: CloningRepositoriesStore,
    private readonly issuesStore: IssuesStore,
    private readonly statsStore: StatsStore,
    private readonly signInStore: SignInStore,
    private readonly accountsStore: AccountsStore,
    private readonly repositoriesStore: RepositoriesStore,
    private readonly pullRequestCoordinator: PullRequestCoordinator,
    private readonly repositoryStateCache: RepositoryStateCache,
    private readonly apiRepositoriesStore: ApiRepositoriesStore
  ) {
    super()

    this.showWelcomeFlow = !hasShownWelcomeFlow()

    this.gitStoreCache = new GitStoreCache(
      shell,
      this.statsStore,
      (repo, store) => this.onGitStoreUpdated(repo, store),
      error => this.emitError(error)
    )

    const browserWindow = remote.getCurrentWindow()
    this.windowState = getWindowState(browserWindow)

    this.onWindowZoomFactorChanged(browserWindow.webContents.zoomFactor)

    this.wireupIpcEventHandlers(browserWindow)
    this.wireupStoreEventHandlers()
    getAppMenu()
    this.tutorialAssessor = new OnboardingTutorialAssessor(
      this.getResolvedExternalEditor
    )

    // We're considering flipping the default value and have new users
    // start off with repository indicators disabled. As such we'll start
    // persisting the current default to localstorage right away so we
    // can change the default in the future without affecting current
    // users.
    if (getBoolean(repositoryIndicatorsEnabledKey) === undefined) {
      setBoolean(repositoryIndicatorsEnabledKey, true)
    }

    this.repositoryIndicatorsEnabled =
      getBoolean(repositoryIndicatorsEnabledKey) ?? true

    this.repositoryIndicatorUpdater = new RepositoryIndicatorUpdater(
      this.getRepositoriesForIndicatorRefresh,
      this.refreshIndicatorForRepository
    )

    window.setTimeout(() => {
      if (this.repositoryIndicatorsEnabled) {
        this.repositoryIndicatorUpdater.start()
      }
    }, InitialRepositoryIndicatorTimeout)
  }

  /** Figure out what step of the tutorial the user needs to do next */
  private async updateCurrentTutorialStep(
    repository: Repository
  ): Promise<void> {
    const currentStep = await this.tutorialAssessor.getCurrentStep(
      repository.isTutorialRepository,
      this.repositoryStateCache.get(repository)
    )
    // only emit an update if its changed
    if (currentStep !== this.currentOnboardingTutorialStep) {
      this.currentOnboardingTutorialStep = currentStep
      log.info(`Current tutorial step is now ${currentStep}`)
      this.recordTutorialStepCompleted(currentStep)
      this.emitUpdate()
    }
  }

  private recordTutorialStepCompleted(step: TutorialStep): void {
    if (!isValidTutorialStep(step)) {
      return
    }

    this.statsStore.recordHighestTutorialStepCompleted(
      orderedTutorialSteps.indexOf(step)
    )

    switch (step) {
      case TutorialStep.PickEditor:
        // don't need to record anything for the first step
        break
      case TutorialStep.CreateBranch:
        this.statsStore.recordTutorialEditorInstalled()
        break
      case TutorialStep.EditFile:
        this.statsStore.recordTutorialBranchCreated()
        break
      case TutorialStep.MakeCommit:
        this.statsStore.recordTutorialFileEdited()
        break
      case TutorialStep.PushBranch:
        this.statsStore.recordTutorialCommitCreated()
        break
      case TutorialStep.OpenPullRequest:
        this.statsStore.recordTutorialBranchPushed()
        break
      case TutorialStep.AllDone:
        this.statsStore.recordTutorialPrCreated()
        this.statsStore.recordTutorialCompleted()
        break
      default:
        assertNever(step, 'Unaccounted for step type')
    }
  }

  public async _resumeTutorial(repository: Repository) {
    this.tutorialAssessor.resumeTutorial()
    await this.updateCurrentTutorialStep(repository)
  }

  public async _pauseTutorial(repository: Repository) {
    this.tutorialAssessor.pauseTutorial()
    await this.updateCurrentTutorialStep(repository)
  }

  /** Call via `Dispatcher` when the user opts to skip the pick editor step of the onboarding tutorial */
  public async _skipPickEditorTutorialStep(repository: Repository) {
    this.tutorialAssessor.skipPickEditor()
    await this.updateCurrentTutorialStep(repository)
  }

  /**
   * Call  via `Dispatcher` when the user has either created a pull request or opts to
   * skip the create pull request step of the onboarding tutorial
   */
  public async _markPullRequestTutorialStepAsComplete(repository: Repository) {
    this.tutorialAssessor.markPullRequestTutorialStepAsComplete()
    await this.updateCurrentTutorialStep(repository)
  }

  private wireupIpcEventHandlers(window: Electron.BrowserWindow) {
    ipcRenderer.on(
      windowStateChannelName,
      (event: Electron.IpcRendererEvent, windowState: WindowState) => {
        this.windowState = windowState
        this.emitUpdate()
      }
    )

    ipcRenderer.on('zoom-factor-changed', (event: any, zoomFactor: number) => {
      this.onWindowZoomFactorChanged(zoomFactor)
    })

    ipcRenderer.on(
      'app-menu',
      (event: Electron.IpcRendererEvent, { menu }: { menu: IMenu }) => {
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

    this.accountsStore.onDidUpdate(accounts => {
      this.accounts = accounts
      this.emitUpdate()
    })
    this.accountsStore.onDidError(error => this.emitError(error))

    this.repositoriesStore.onDidUpdate(updateRepositories => {
      this.repositories = updateRepositories
      this.updateRepositorySelectionAfterRepositoriesChanged()
      this.emitUpdate()
    })

    this.pullRequestCoordinator.onPullRequestsChanged((repo, pullRequests) =>
      this.onPullRequestChanged(repo, pullRequests)
    )
    this.pullRequestCoordinator.onIsLoadingPullRequests(
      (repository, isLoadingPullRequests) => {
        this.repositoryStateCache.updateBranchesState(repository, () => {
          return { isLoadingPullRequests }
        })
        this.emitUpdate()
      }
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

      return {
        type: SelectionType.CloningRepository,
        repository,
        progress,
      }
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
      recentRepositories: this.recentRepositories,
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
      stashedFilesWidth: this.stashedFilesWidth,
      appMenuState: this.appMenu ? this.appMenu.openMenus : [],
      highlightAccessKeys: this.highlightAccessKeys,
      isUpdateAvailableBannerVisible: this.isUpdateAvailableBannerVisible,
      currentBanner: this.currentBanner,
      askToMoveToApplicationsFolderSetting: this
        .askToMoveToApplicationsFolderSetting,
      askForConfirmationOnRepositoryRemoval: this
        .askForConfirmationOnRepositoryRemoval,
      askForConfirmationOnDiscardChanges: this.confirmDiscardChanges,
      askForConfirmationOnForcePush: this.askForConfirmationOnForcePush,
      uncommittedChangesStrategy: this.uncommittedChangesStrategy,
      selectedExternalEditor: this.selectedExternalEditor,
      imageDiffType: this.imageDiffType,
      hideWhitespaceInChangesDiff: this.hideWhitespaceInChangesDiff,
      hideWhitespaceInHistoryDiff: this.hideWhitespaceInHistoryDiff,
      showSideBySideDiff: this.showSideBySideDiff,
      selectedShell: this.selectedShell,
      repositoryFilterText: this.repositoryFilterText,
      resolvedExternalEditor: this.resolvedExternalEditor,
      selectedCloneRepositoryTab: this.selectedCloneRepositoryTab,
      selectedBranchesTab: this.selectedBranchesTab,
      selectedTheme: this.selectedTheme,
      currentTheme: this.currentTheme,
      apiRepositories: this.apiRepositoriesStore.getState(),
      optOutOfUsageTracking: this.statsStore.getOptOut(),
      currentOnboardingTutorialStep: this.currentOnboardingTutorialStep,
      repositoryIndicatorsEnabled: this.repositoryIndicatorsEnabled,
      commitSpellcheckEnabled: this.commitSpellcheckEnabled,
      hasShownCherryPickIntro: this.hasShownCherryPickIntro,
      currentDragElement: this.currentDragElement,
      lastThankYou: this.lastThankYou,
    }
  }

  private onGitStoreUpdated(repository: Repository, gitStore: GitStore) {
    const prevRepositoryState = this.repositoryStateCache.get(repository)

    this.repositoryStateCache.updateBranchesState(repository, state => {
      let { currentPullRequest } = state
      const { tip, currentRemote: remote } = gitStore

      // If the tip has changed we need to re-evaluate whether or not the
      // current pull request is still valid. Note that we're not using
      // updateCurrentPullRequest here because we know for certain that
      // the list of open pull requests haven't changed so we can find
      // a happy path where the tip has changed but the current PR is
      // still valid which doesn't require us to iterate through the
      // list of open PRs.
      if (
        !tipEquals(state.tip, tip) ||
        !remoteEquals(prevRepositoryState.remote, remote)
      ) {
        if (tip.kind !== TipState.Valid || remote === null) {
          // The tip isn't a branch so or the current branch doesn't have a remote
          // so there can't be a current pull request.
          currentPullRequest = null
        } else {
          const { branch } = tip

          if (
            !currentPullRequest ||
            !isPullRequestAssociatedWithBranch(
              branch,
              currentPullRequest,
              remote
            )
          ) {
            // Either we don't have a current pull request or the current pull
            // request no longer matches the tip, let's go hunting for a new one.
            const prs = state.openPullRequests
            currentPullRequest = findAssociatedPullRequest(branch, prs, remote)
          }

          if (
            tip.kind === TipState.Valid &&
            state.tip.kind === TipState.Valid &&
            tip.branch.name !== state.tip.branch.name
          ) {
            this.refreshBranchProtectionState(repository)
          }
        }
      }

      return {
        tip: gitStore.tip,
        defaultBranch: gitStore.defaultBranch,
        allBranches: gitStore.allBranches,
        recentBranches: gitStore.recentBranches,
        pullWithRebase: gitStore.pullWithRebase,
        currentPullRequest,
      }
    })

    let selectWorkingDirectory = false
    let selectStashEntry = false

    this.repositoryStateCache.updateChangesState(repository, state => {
      const stashEntry = gitStore.currentBranchStashEntry

      // Figure out what selection changes we need to make as a result of this
      // change.
      if (state.selection.kind === ChangesSelectionKind.Stash) {
        if (state.stashEntry !== null) {
          if (stashEntry === null) {
            // We're showing a stash now and the stash entry has just disappeared
            // so we need to switch back over to the working directory.
            selectWorkingDirectory = true
          } else if (state.stashEntry.stashSha !== stashEntry.stashSha) {
            // The current stash entry has changed from underneath so we must
            // ensure we have a valid selection.
            selectStashEntry = true
          }
        }
      }

      return {
        commitMessage: gitStore.commitMessage,
        showCoAuthoredBy: gitStore.showCoAuthoredBy,
        coAuthors: gitStore.coAuthors,
        stashEntry,
      }
    })

    this.repositoryStateCache.update(repository, () => ({
      commitLookup: gitStore.commitLookup,
      localCommitSHAs: gitStore.localCommitSHAs,
      localTags: gitStore.localTags,
      aheadBehind: gitStore.aheadBehind,
      tagsToPush: gitStore.tagsToPush,
      remote: gitStore.currentRemote,
      lastFetched: gitStore.lastFetched,
    }))

    // _selectWorkingDirectoryFiles and _selectStashedFile will
    // emit updates by themselves.
    if (selectWorkingDirectory) {
      this._selectWorkingDirectoryFiles(repository)
    } else if (selectStashEntry) {
      this._selectStashedFile(repository)
    } else {
      this.emitUpdate()
    }
  }

  private clearBranchProtectionState(repository: Repository) {
    this.repositoryStateCache.updateChangesState(repository, () => ({
      currentBranchProtected: false,
    }))
    this.emitUpdate()
  }

  private async refreshBranchProtectionState(repository: Repository) {
    const { tip, currentRemote } = this.gitStoreCache.get(repository)

    if (tip.kind !== TipState.Valid || repository.gitHubRepository === null) {
      return
    }

    const gitHubRepo = repository.gitHubRepository
    const branchName = findRemoteBranchName(tip, currentRemote, gitHubRepo)

    if (branchName !== null) {
      const account = getAccountForEndpoint(this.accounts, gitHubRepo.endpoint)

      if (account === null) {
        return
      }

      // If the user doesn't have write access to the repository
      // it doesn't matter if the branch is protected or not and
      // we can avoid the API call. See the `showNoWriteAccess`
      // prop in the `CommitMessage` component where we specifically
      // test for this scenario and show a message specifically
      // about write access before showing a branch protection
      // warning.
      if (!hasWritePermission(gitHubRepo)) {
        this.repositoryStateCache.updateChangesState(repository, () => ({
          currentBranchProtected: false,
        }))
        this.emitUpdate()
        return
      }

      const name = gitHubRepo.name
      const owner = gitHubRepo.owner.login
      const api = API.fromAccount(account)

      const pushControl = await api.fetchPushControl(owner, name, branchName)
      const currentBranchProtected = !isBranchPushable(pushControl)

      this.repositoryStateCache.updateChangesState(repository, () => ({
        currentBranchProtected,
      }))
      this.emitUpdate()
    }
  }

  private clearSelectedCommit(repository: Repository) {
    this.repositoryStateCache.updateCommitSelection(repository, () => ({
      shas: [],
      file: null,
      changedFiles: [],
      diff: null,
    }))
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _changeCommitSelection(
    repository: Repository,
    shas: ReadonlyArray<string>
  ): Promise<void> {
    const { commitSelection } = this.repositoryStateCache.get(repository)

    if (
      commitSelection.shas.length === shas.length &&
      commitSelection.shas.every((sha, i) => sha === shas[i])
    ) {
      return
    }

    this.repositoryStateCache.updateCommitSelection(repository, () => ({
      shas,
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
    let selectedSHA =
      state.commitSelection.shas.length === 1
        ? state.commitSelection.shas[0]
        : null
    if (selectedSHA != null) {
      const index = commitSHAs.findIndex(sha => sha === selectedSHA)
      if (index < 0) {
        // selected SHA is not in this list
        // -> clear the selection in the app state
        selectedSHA = null
        this.clearSelectedCommit(repository)
      }
    }

    if (state.commitSelection.shas.length === 0 && commitSHAs.length > 0) {
      this._changeCommitSelection(repository, [commitSHAs[0]])
      this._loadChangedFilesForCurrentSelection(repository)
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _initializeCompare(
    repository: Repository,
    initialAction?: CompareAction
  ) {
    const state = this.repositoryStateCache.get(repository)

    const { branchesState, compareState } = state
    const { tip } = branchesState
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null

    const branches = branchesState.allBranches.filter(
      b => b.name !== currentBranch?.name && !b.isDesktopForkRemoteBranch
    )
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

    this.repositoryStateCache.updateCompareState(repository, () => ({
      branches,
      recentBranches,
      defaultBranch,
    }))

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

    const loadingMerge: MergeTreeResult = {
      kind: ComputedAction.Loading,
    }

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
            `Error occurred while trying to merge ${tip.branch.name} (${tip.branch.tip.sha}) and ${action.branch.name} (${action.branch.tip.sha})`,
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
    const currentSHAs = commitSelection.shas
    if (currentSHAs.length !== 1) {
      // if none or multiple, we don't display a diff
      return
    }

    const gitStore = this.gitStoreCache.get(repository)
    const changedFiles = await gitStore.performFailableOperation(() =>
      getChangedFiles(repository, currentSHAs[0])
    )
    if (!changedFiles) {
      return
    }

    // The selection could have changed between when we started loading the
    // changed files and we finished. We might wanna store the changed files per
    // SHA/path.
    if (
      commitSelection.shas.length !== currentSHAs.length ||
      commitSelection.shas[0] !== currentSHAs[0]
    ) {
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
    const shas = stateBeforeLoad.commitSelection.shas

    if (shas.length === 0) {
      if (__DEV__) {
        throw new Error(
          "No currently selected sha yet we've been asked to switch file selection"
        )
      } else {
        return
      }
    }

    // We do not get a diff when multiple commits selected
    if (shas.length > 1) {
      return
    }

    const diff = await getCommitDiff(
      repository,
      file,
      shas[0],
      this.hideWhitespaceInHistoryDiff
    )

    const stateAfterLoad = this.repositoryStateCache.get(repository)
    const { shas: shasAfter } = stateAfterLoad.commitSelection
    // A whole bunch of things could have happened since we initiated the diff load
    if (shasAfter.length !== shas.length || shasAfter[0] !== shas[0]) {
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

    // do this quick check to see if we have a tutorial repository
    // cause if its not we can quickly hide the tutorial pane
    // in the first `emitUpdate` below
    const previouslyInTutorial =
      this.currentOnboardingTutorialStep !== TutorialStep.NotApplicable
    if (
      previouslyInTutorial &&
      (!(repository instanceof Repository) || !repository.isTutorialRepository)
    ) {
      this.currentOnboardingTutorialStep = TutorialStep.NotApplicable
    }

    this.selectedRepository = repository

    this.emitUpdate()
    this.stopBackgroundFetching()
    this.stopPullRequestUpdater()
    this._clearBanner()
    this.stopBackgroundPruner()

    if (repository == null) {
      return Promise.resolve(null)
    }

    if (!(repository instanceof Repository)) {
      return Promise.resolve(null)
    }

    setNumber(LastSelectedRepositoryIDKey, repository.id)

    const previousRepositoryId = previouslySelectedRepository
      ? previouslySelectedRepository.id
      : null

    this.updateRecentRepositories(previousRepositoryId, repository.id)

    // if repository might be marked missing, try checking if it has been restored
    const refreshedRepository = await this.recoverMissingRepository(repository)
    if (refreshedRepository.missing) {
      // as the repository is no longer found on disk, cleaning this up
      // ensures we don't accidentally run any Git operations against the
      // wrong location if the user then relocates the `.git` folder elsewhere
      this.gitStoreCache.remove(repository)
      return Promise.resolve(null)
    }

    // This is now purely for metrics collection for `commitsToRepositoryWithBranchProtections`
    // Understanding how many users actually contribute to repos with branch protections gives us
    // insight into who our users are and what kinds of work they do
    this.updateBranchProtectionsFromAPI(repository)

    return this._selectRepositoryRefreshTasks(
      refreshedRepository,
      previouslySelectedRepository
    )
  }

  // update the stored list of recently opened repositories
  private updateRecentRepositories(
    previousRepositoryId: number | null,
    currentRepositoryId: number
  ) {
    // No need to update the recent repositories if the selected repository is
    // the same as the old one (this could happen when the alias of the selected
    // repository is changed).
    if (previousRepositoryId === currentRepositoryId) {
      return
    }

    const recentRepositories = getNumberArray(RecentRepositoriesKey).filter(
      el => el !== currentRepositoryId && el !== previousRepositoryId
    )
    if (previousRepositoryId !== null) {
      recentRepositories.unshift(previousRepositoryId)
    }
    const slicedRecentRepositories = recentRepositories.slice(
      0,
      RecentRepositoriesLength
    )
    setNumberArray(RecentRepositoriesKey, slicedRecentRepositories)
    this.recentRepositories = slicedRecentRepositories
    this.emitUpdate()
  }

  // finish `_selectRepository`s refresh tasks
  private async _selectRepositoryRefreshTasks(
    repository: Repository,
    previouslySelectedRepository: Repository | CloningRepository | null
  ): Promise<Repository | null> {
    this._refreshRepository(repository)

    if (isRepositoryWithGitHubRepository(repository)) {
      // Load issues from the upstream or fork depending
      // on workflow preferences.
      const ghRepo = getNonForkGitHubRepository(repository)

      this._refreshIssues(ghRepo)
      this.refreshMentionables(ghRepo)

      this.pullRequestCoordinator.getAllPullRequests(repository).then(prs => {
        this.onPullRequestChanged(repository, prs)
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
    this.stopBackgroundPruner()

    this.startBackgroundFetching(repository, !previouslySelectedRepository)
    this.startPullRequestUpdater(repository)

    this.startBackgroundPruner(repository)

    this.addUpstreamRemoteIfNeeded(repository)

    return this.repositoryWithRefreshedGitHubRepository(repository)
  }

  private stopBackgroundPruner() {
    const pruner = this.currentBranchPruner

    if (pruner !== null) {
      pruner.stop()
      this.currentBranchPruner = null
    }
  }

  private startBackgroundPruner(repository: Repository) {
    if (this.currentBranchPruner !== null) {
      fatalError(
        `A branch pruner is already active and cannot start updating on ${repository.name}`
      )
    }

    const pruner = new BranchPruner(
      repository,
      this.gitStoreCache,
      this.repositoriesStore,
      this.repositoryStateCache,
      repository => this._refreshRepository(repository)
    )
    this.currentBranchPruner = pruner
    this.currentBranchPruner.start()
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

  private refreshMentionables(repository: GitHubRepository) {
    const account = getAccountForEndpoint(this.accounts, repository.endpoint)
    if (!account) {
      return
    }

    this.gitHubUserStore.updateMentionables(repository, account)
  }

  private startPullRequestUpdater(repository: Repository) {
    // We don't want to run the pull request updater when the app is in
    // the background.
    if (this.appIsFocused && isRepositoryWithGitHubRepository(repository)) {
      const account = getAccountForRepository(this.accounts, repository)
      if (account !== null) {
        return this.pullRequestCoordinator.startPullRequestUpdater(
          repository,
          account
        )
      }
    }
    // we always want to stop the current one, to be safe
    this.pullRequestCoordinator.stopPullRequestUpdater()
  }

  private stopPullRequestUpdater() {
    this.pullRequestCoordinator.stopPullRequestUpdater()
  }

  public async fetchPullRequest(repoUrl: string, pr: string) {
    const endpoint = getEndpointForRepository(repoUrl)
    const account = getAccountForEndpoint(this.accounts, endpoint)

    if (account) {
      const api = API.fromAccount(account)
      const remoteUrl = parseRemote(repoUrl)
      if (remoteUrl && remoteUrl.owner && remoteUrl.name) {
        return await api.fetchPullRequest(remoteUrl.owner, remoteUrl.name, pr)
      }
    }
    return null
  }

  private async shouldBackgroundFetch(
    repository: Repository,
    lastPush: Date | null
  ): Promise<boolean> {
    const gitStore = this.gitStoreCache.get(repository)
    const lastFetched = await gitStore.updateLastFetched()

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
        `We should only have on background fetcher active at once, but we're trying to start background fetching on ${repository.name} while another background fetcher is still active!`
      )
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

    this.updateRepositorySelectionAfterRepositoriesChanged()

    this.sidebarWidth = getNumber(sidebarWidthConfigKey, defaultSidebarWidth)
    this.commitSummaryWidth = getNumber(
      commitSummaryWidthConfigKey,
      defaultCommitSummaryWidth
    )
    this.stashedFilesWidth = getNumber(
      stashedFilesWidthConfigKey,
      defaultStashedFilesWidth
    )

    this.askToMoveToApplicationsFolderSetting = getBoolean(
      askToMoveToApplicationsFolderKey,
      askToMoveToApplicationsFolderDefault
    )

    this.askForConfirmationOnRepositoryRemoval = getBoolean(
      confirmRepoRemovalKey,
      confirmRepoRemovalDefault
    )

    this.confirmDiscardChanges = getBoolean(
      confirmDiscardChangesKey,
      confirmDiscardChangesDefault
    )

    this.askForConfirmationOnForcePush = getBoolean(
      confirmForcePushKey,
      askForConfirmationOnForcePushDefault
    )

    this.uncommittedChangesStrategy =
      getEnum(uncommittedChangesStrategyKey, UncommittedChangesStrategy) ??
      defaultUncommittedChangesStrategy

    this.updateSelectedExternalEditor(
      await this.lookupSelectedExternalEditor()
    ).catch(e => log.error('Failed resolving current editor at startup', e))

    const shellValue = localStorage.getItem(shellKey)
    this.selectedShell = shellValue ? parseShell(shellValue) : DefaultShell

    this.updateMenuLabelsForSelectedRepository()

    const imageDiffTypeValue = localStorage.getItem(imageDiffTypeKey)
    this.imageDiffType =
      imageDiffTypeValue === null
        ? imageDiffTypeDefault
        : parseInt(imageDiffTypeValue)

    this.hideWhitespaceInChangesDiff = getBoolean(
      hideWhitespaceInChangesDiffKey,
      false
    )
    this.hideWhitespaceInHistoryDiff = getBoolean(
      hideWhitespaceInHistoryDiffKey,
      false
    )
    this.commitSpellcheckEnabled = getBoolean(
      commitSpellcheckEnabledKey,
      commitSpellcheckEnabledDefault
    )
    this.showSideBySideDiff = getShowSideBySideDiff()

    this.selectedTheme = getPersistedTheme()
    // Make sure the persisted theme is applied
    setPersistedTheme(this.selectedTheme)

    this.currentTheme = getCurrentlyAppliedTheme()

    themeChangeMonitor.onThemeChanged(theme => {
      this.currentTheme = theme
      this.emitUpdate()
    })

    this.hasShownCherryPickIntro = getBoolean(hasShownCherryPickIntroKey, false)
    this.lastThankYou = getObject<ILastThankYou>(lastThankYouKey)

    this.emitUpdateNow()

    this.accountsStore.refresh()
  }

  private updateSelectedExternalEditor(
    selectedEditor: string | null
  ): Promise<void> {
    this.selectedExternalEditor = selectedEditor

    // Make sure we keep the resolved (cached) editor
    // in sync when the user changes their editor choice.
    return this._resolveCurrentEditor()
  }

  private async lookupSelectedExternalEditor(): Promise<string | null> {
    const editors = (await getAvailableEditors()).map(found => found.editor)

    const value = localStorage.getItem(externalEditorKey)
    // ensure editor is still installed
    if (value && editors.includes(value)) {
      return value
    }

    if (editors.length) {
      const value = editors[0]
      // store this value to avoid the lookup next time
      localStorage.setItem(externalEditorKey, value)
      return value
    }

    return null
  }

  /**
   * Update menu labels for the selected repository.
   *
   * If selected repository type is a `CloningRepository` or
   * `MissingRepository`, the menu labels will be updated but they will lack
   * the expected `IRepositoryState` and revert to the default values.
   */
  private updateMenuLabelsForSelectedRepository() {
    const { selectedState } = this.getState()

    if (
      selectedState !== null &&
      selectedState.type === SelectionType.Repository
    ) {
      this.updateMenuItemLabels(selectedState.state)
    } else {
      this.updateMenuItemLabels(null)
    }
  }

  /**
   * Update the menus in the main process using the provided repository state
   *
   * @param state the current repository state, or `null` if the repository is
   *              being cloned or is missing
   */
  private updateMenuItemLabels(state: IRepositoryState | null) {
    const {
      selectedShell,
      selectedExternalEditor,
      askForConfirmationOnRepositoryRemoval,
      askForConfirmationOnForcePush,
    } = this

    const labels: MenuLabelsEvent = {
      selectedShell,
      selectedExternalEditor,
      askForConfirmationOnRepositoryRemoval,
      askForConfirmationOnForcePush,
    }

    if (state === null) {
      updatePreferredAppMenuItemLabels(labels)
      return
    }

    const { changesState, branchesState, aheadBehind } = state
    const { defaultBranch, currentPullRequest } = branchesState

    const defaultBranchName =
      defaultBranch === null || defaultBranch.upstreamWithoutRemote === null
        ? undefined
        : defaultBranch.upstreamWithoutRemote

    const isForcePushForCurrentRepository = isCurrentBranchForcePush(
      branchesState,
      aheadBehind
    )

    const isStashedChangesVisible =
      changesState.selection.kind === ChangesSelectionKind.Stash

    const askForConfirmationWhenStashingAllChanges =
      changesState.stashEntry !== null

    updatePreferredAppMenuItemLabels({
      ...labels,
      defaultBranchName,
      isForcePushForCurrentRepository,
      isStashedChangesVisible,
      hasCurrentPullRequest: currentPullRequest !== null,
      askForConfirmationWhenStashingAllChanges,
    })
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
  ): Promise<IStatusResult | null> {
    const gitStore = this.gitStoreCache.get(repository)
    const status = await gitStore.loadStatus()

    if (status === null) {
      return null
    }

    this.repositoryStateCache.updateChangesState(repository, state =>
      updateChangedFiles(state, status, clearPartialState)
    )

    this.repositoryStateCache.updateChangesState(repository, state => ({
      conflictState: updateConflictState(state, status, this.statsStore),
    }))

    this.updateRebaseFlowConflictsIfFound(repository)
    this.updateCherryPickFlowConflictsIfFound(repository)

    if (this.selectedRepository === repository) {
      this._triggerConflictsFlow(repository)
    }

    this.emitUpdate()

    this.updateChangesWorkingDirectoryDiff(repository)

    return status
  }

  /**
   * Push changes from latest conflicts into current rebase flow step, if needed
   */
  private updateRebaseFlowConflictsIfFound(repository: Repository) {
    const { changesState, rebaseState } = this.repositoryStateCache.get(
      repository
    )
    const { conflictState } = changesState

    if (conflictState === null || !isRebaseConflictState(conflictState)) {
      return
    }

    const { step } = rebaseState
    if (step === null) {
      return
    }

    if (
      step.kind === RebaseStep.ShowConflicts ||
      step.kind === RebaseStep.ConfirmAbort
    ) {
      // merge in new conflicts with known branches so they are not forgotten
      const { baseBranch, targetBranch } = step.conflictState
      const newConflictsState = {
        ...conflictState,
        baseBranch,
        targetBranch,
      }

      this.repositoryStateCache.updateRebaseState(repository, () => ({
        step: { ...step, conflictState: newConflictsState },
      }))
    }
  }

  /**
   * Push changes from latest conflicts into current cherry pick flow step, if needed
   *  - i.e. - multiple instance of running in to conflicts
   */
  private updateCherryPickFlowConflictsIfFound(repository: Repository) {
    const { changesState, cherryPickState } = this.repositoryStateCache.get(
      repository
    )
    const { conflictState } = changesState

    if (conflictState === null || !isCherryPickConflictState(conflictState)) {
      return
    }

    const { step } = cherryPickState
    if (step === null) {
      return
    }

    if (step.kind === CherryPickStepKind.ShowConflicts) {
      this.repositoryStateCache.updateCherryPickState(repository, () => ({
        step: { ...step, conflictState },
      }))
    }
  }

  private async _triggerConflictsFlow(repository: Repository) {
    const state = this.repositoryStateCache.get(repository)
    const { conflictState } = state.changesState

    if (conflictState === null) {
      this.clearConflictsFlowVisuals(state)
      return
    }

    if (isMergeConflictState(conflictState)) {
      await this.showMergeConflictsDialog(repository, conflictState)
    } else if (isRebaseConflictState(conflictState)) {
      await this.showRebaseConflictsDialog(repository, conflictState)
    } else if (isCherryPickConflictState(conflictState)) {
      await this.showCherryPickConflictsDialog(repository, conflictState)
    } else {
      assertNever(conflictState, `Unsupported conflict kind`)
    }
  }

  /**
   * Cleanup any related UI related to conflicts if still in use.
   */
  private clearConflictsFlowVisuals(state: IRepositoryState) {
    if (userIsStartingRebaseFlow(this.currentPopup, state.rebaseState)) {
      return
    }

    this._closePopup(PopupType.MergeConflicts)
    this._closePopup(PopupType.AbortMerge)
    this._clearBanner(BannerType.MergeConflictsFound)

    this._closePopup(PopupType.RebaseFlow)
    this._clearBanner(BannerType.RebaseConflictsFound)
  }

  /** display the rebase flow, if not already in this flow */
  private async showRebaseConflictsDialog(
    repository: Repository,
    conflictState: RebaseConflictState
  ) {
    const alreadyInFlow =
      this.currentPopup !== null &&
      this.currentPopup.type === PopupType.RebaseFlow

    if (alreadyInFlow) {
      return
    }

    const displayingBanner =
      this.currentBanner !== null &&
      this.currentBanner.type === BannerType.RebaseConflictsFound

    if (displayingBanner) {
      return
    }

    await this._setRebaseProgressFromState(repository)

    const step = initializeRebaseFlowForConflictedRepository(conflictState)

    this.repositoryStateCache.updateRebaseState(repository, () => ({
      step,
    }))

    this._showPopup({
      type: PopupType.RebaseFlow,
      repository,
    })
  }

  /** starts the conflict resolution flow, if appropriate */
  private async showMergeConflictsDialog(
    repository: Repository,
    conflictState: MergeConflictState
  ) {
    // are we already in the merge conflicts flow?
    const alreadyInFlow =
      this.currentPopup !== null &&
      (this.currentPopup.type === PopupType.MergeConflicts ||
        this.currentPopup.type === PopupType.AbortMerge)

    // have we already been shown the merge conflicts flow *and closed it*?
    const alreadyExitedFlow =
      this.currentBanner !== null &&
      this.currentBanner.type === BannerType.MergeConflictsFound

    if (alreadyInFlow || alreadyExitedFlow) {
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
    this.repositoryStateCache.update(repository, state => {
      if (state.selectedSection !== selectedSection) {
        this.statsStore.recordRepositoryViewChanged()
      }
      return { selectedSection }
    })
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

  /**
   * Changes the selection in the changes view to the working directory and
   * optionally selects one or more files from the working directory.
   *
   *  @param files An array of files to select when showing the working directory.
   *               If undefined this method will preserve the previously selected
   *               files or pick the first changed file if no selection exists.
   *
   * Note: This shouldn't be called directly. See `Dispatcher`.
   */
  public async _selectWorkingDirectoryFiles(
    repository: Repository,
    files?: ReadonlyArray<WorkingDirectoryFileChange>
  ): Promise<void> {
    this.repositoryStateCache.updateChangesState(repository, state =>
      selectWorkingDirectoryFiles(state, files)
    )

    this.updateMenuLabelsForSelectedRepository()
    this.emitUpdate()
    this.updateChangesWorkingDirectoryDiff(repository)
  }

  /**
   * Loads or re-loads (refreshes) the diff for the currently selected file
   * in the working directory. This operation is a noop if there's no currently
   * selected file.
   */
  private async updateChangesWorkingDirectoryDiff(
    repository: Repository
  ): Promise<void> {
    const stateBeforeLoad = this.repositoryStateCache.get(repository)
    const changesStateBeforeLoad = stateBeforeLoad.changesState

    if (
      changesStateBeforeLoad.selection.kind !==
      ChangesSelectionKind.WorkingDirectory
    ) {
      return
    }

    const selectionBeforeLoad = changesStateBeforeLoad.selection
    const selectedFileIDsBeforeLoad = selectionBeforeLoad.selectedFileIDs

    // We only render diffs when a single file is selected.
    if (selectedFileIDsBeforeLoad.length !== 1) {
      if (selectionBeforeLoad.diff !== null) {
        this.repositoryStateCache.updateChangesState(repository, () => ({
          selection: {
            ...selectionBeforeLoad,
            diff: null,
          },
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
      selectedFileBeforeLoad,
      enableHideWhitespaceInDiffOption() && this.hideWhitespaceInChangesDiff
    )

    const stateAfterLoad = this.repositoryStateCache.get(repository)
    const changesState = stateAfterLoad.changesState

    // A different file (or files) could have been selected while we were
    // loading the diff in which case we no longer care about the diff we
    // just loaded.
    if (
      changesState.selection.kind !== ChangesSelectionKind.WorkingDirectory ||
      !arrayEquals(
        changesState.selection.selectedFileIDs,
        selectedFileIDsBeforeLoad
      )
    ) {
      return
    }

    const selectedFileID = changesState.selection.selectedFileIDs[0]

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
    if (diff.kind === DiffType.Text || diff.kind === DiffType.LargeText) {
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

    const selection: ChangesWorkingDirectorySelection = {
      ...changesState.selection,
      diff,
    }

    this.repositoryStateCache.updateChangesState(repository, () => ({
      selection,
      workingDirectory,
    }))
    this.emitUpdate()
  }

  public _hideStashedChanges(repository: Repository) {
    const { changesState } = this.repositoryStateCache.get(repository)

    // makes this safe to call even when the stash ui is not visible
    if (changesState.selection.kind !== ChangesSelectionKind.Stash) {
      return
    }

    this.repositoryStateCache.updateChangesState(repository, state => {
      const files = state.workingDirectory.files
      const selectedFileIds = files
        .filter(f => f.selection.getSelectionType() !== DiffSelectionType.None)
        .map(f => f.id)

      return {
        selection: {
          kind: ChangesSelectionKind.WorkingDirectory,
          diff: null,
          selectedFileIDs: selectedFileIds,
        },
      }
    })
    this.emitUpdate()

    this.updateMenuLabelsForSelectedRepository()
  }

  /**
   * Changes the selection in the changes view to the stash entry view and
   * optionally selects a particular file from the current stash entry.
   *
   *  @param file  A file to select when showing the stash entry.
   *               If undefined this method will preserve the previously selected
   *               file or pick the first changed file if no selection exists.
   *
   * Note: This shouldn't be called directly. See `Dispatcher`.
   */
  public async _selectStashedFile(
    repository: Repository,
    file?: CommittedFileChange | null
  ): Promise<void> {
    this.repositoryStateCache.update(repository, () => ({
      selectedSection: RepositorySectionTab.Changes,
    }))
    this.repositoryStateCache.updateChangesState(repository, state => {
      let selectedStashedFile: CommittedFileChange | null = null
      const { stashEntry, selection } = state

      const currentlySelectedFile =
        selection.kind === ChangesSelectionKind.Stash
          ? selection.selectedStashedFile
          : null

      const currentFiles =
        stashEntry !== null &&
        stashEntry.files.kind === StashedChangesLoadStates.Loaded
          ? stashEntry.files.files
          : []

      if (file === undefined) {
        if (currentlySelectedFile !== null) {
          // Ensure the requested file exists in the stash entry and
          // that we can use reference equality to figure out which file
          // is selected in the list. If we can't find it we'll pick the
          // first file available or null if no files have been loaded.
          selectedStashedFile =
            currentFiles.find(x => x.id === currentlySelectedFile.id) ||
            currentFiles[0] ||
            null
        } else {
          // No current selection, let's just pick the first file available
          // or null if no files have been loaded.
          selectedStashedFile = currentFiles[0] || null
        }
      } else if (file !== null) {
        // Look up the selected file in the stash entry, it's possible that
        // the stash entry or file list has changed since the consumer called
        // us. The working directory selection handles this by using IDs rather
        // than references.
        selectedStashedFile = currentFiles.find(x => x.id === file.id) || null
      }

      return {
        selection: {
          kind: ChangesSelectionKind.Stash,
          selectedStashedFile,
          selectedStashedFileDiff: null,
        },
      }
    })

    this.updateMenuLabelsForSelectedRepository()
    this.emitUpdate()
    this.updateChangesStashDiff(repository)

    if (!this.hasUserViewedStash) {
      // `hasUserViewedStash` is reset to false on every branch checkout
      // so we increment the metric before setting `hasUserViewedStash` to true
      // to make sure we only increment on the first view after checkout
      this.statsStore.recordStashViewedAfterCheckout()
      this.hasUserViewedStash = true
    }
  }

  private async updateChangesStashDiff(repository: Repository) {
    const stateBeforeLoad = this.repositoryStateCache.get(repository)
    const changesStateBeforeLoad = stateBeforeLoad.changesState
    const selectionBeforeLoad = changesStateBeforeLoad.selection

    if (selectionBeforeLoad.kind !== ChangesSelectionKind.Stash) {
      return
    }

    const stashEntry = changesStateBeforeLoad.stashEntry

    if (stashEntry === null) {
      return
    }

    let file = selectionBeforeLoad.selectedStashedFile

    if (file === null) {
      if (stashEntry.files.kind === StashedChangesLoadStates.Loaded) {
        if (stashEntry.files.files.length > 0) {
          file = stashEntry.files.files[0]
        }
      }
    }

    if (file === null) {
      this.repositoryStateCache.updateChangesState(repository, () => ({
        selection: {
          kind: ChangesSelectionKind.Stash,
          selectedStashedFile: null,
          selectedStashedFileDiff: null,
        },
      }))
      this.emitUpdate()
      return
    }

    const diff = await getCommitDiff(repository, file, file.commitish)

    const stateAfterLoad = this.repositoryStateCache.get(repository)
    const changesStateAfterLoad = stateAfterLoad.changesState

    // Something has changed during our async getCommitDiff, bail
    if (
      changesStateAfterLoad.selection.kind !== ChangesSelectionKind.Stash ||
      changesStateAfterLoad.selection.selectedStashedFile !==
        selectionBeforeLoad.selectedStashedFile
    ) {
      return
    }

    this.repositoryStateCache.updateChangesState(repository, () => ({
      selection: {
        kind: ChangesSelectionKind.Stash,
        selectedStashedFile: file,
        selectedStashedFileDiff: diff,
      },
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

    return this.withIsCommitting(repository, async () => {
      const result = await gitStore.performFailableOperation(async () => {
        const message = await formatCommitMessage(repository, context)
        return createCommit(repository, message, selectedFiles)
      })

      if (result !== undefined) {
        await this._recordCommitStats(
          gitStore,
          repository,
          state,
          context,
          files
        )

        await this._refreshRepository(repository)
        await this.refreshChangesSection(repository, {
          includingStatus: true,
          clearPartialState: true,
        })
      }

      return result !== undefined
    })
  }

  private async _recordCommitStats(
    gitStore: GitStore,
    repository: Repository,
    repositoryState: IRepositoryState,
    context: ICommitContext,
    files: readonly WorkingDirectoryFileChange[]
  ) {
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

        const { commitAuthor } = repositoryState
        if (commitAuthor !== null) {
          const commitEmail = commitAuthor.email.toLowerCase()
          const attributableEmails = getAttributableEmailsFor(account)
          const commitEmailMatchesAccount = attributableEmails.some(
            email => email.toLowerCase() === commitEmail
          )
          if (!commitEmailMatchesAccount) {
            this.statsStore.recordUnattributedCommit()
          }
        }
      }

      const branchProtectionsFound = await this.repositoriesStore.hasBranchProtectionsConfigured(
        repository.gitHubRepository
      )

      if (branchProtectionsFound) {
        this.statsStore.recordCommitToRepositoryWithBranchProtections()
      }

      const branchName = findRemoteBranchName(
        gitStore.tip,
        gitStore.currentRemote,
        repository.gitHubRepository
      )

      if (branchName !== null) {
        const { changesState } = this.repositoryStateCache.get(repository)
        if (changesState.currentBranchProtected) {
          this.statsStore.recordCommitToProtectedBranch()
        }
      }

      if (
        repository.gitHubRepository !== null &&
        !hasWritePermission(repository.gitHubRepository)
      ) {
        this.statsStore.recordCommitToRepositoryWithoutWriteAccess()
        this.statsStore.recordRepositoryCommitedInWithoutWriteAccess(
          repository.gitHubRepository.dbID
        )
      }
    }
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
    if (!repository.missing) {
      return repository
    }

    const foundRepository =
      (await pathExists(repository.path)) &&
      (await isGitRepository(repository.path)) &&
      (await this._loadStatus(repository)) !== null

    if (foundRepository) {
      return await this._updateRepositoryMissing(repository, false)
    }
    return repository
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
    this.updateSidebarIndicator(repository, status)

    if (status === null) {
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
      gitStore.loadStashEntries(),
      this._refreshAuthor(repository),
      refreshSectionPromise,
    ])

    await gitStore.refreshTags()

    // this promise is fire-and-forget, so no need to await it
    this.updateStashEntryCountMetric(
      repository,
      gitStore.desktopStashEntryCount,
      gitStore.stashEntryCount
    )
    this.updateCurrentPullRequest(repository)

    const latestState = this.repositoryStateCache.get(repository)
    this.updateMenuItemLabels(latestState)

    this._initializeCompare(repository)

    this.updateCurrentTutorialStep(repository)
  }

  private async updateStashEntryCountMetric(
    repository: Repository,
    desktopStashEntryCount: number,
    stashEntryCount: number
  ) {
    const lastStashEntryCheck = await this.repositoriesStore.getLastStashCheckDate(
      repository
    )
    const dateNow = moment()
    const threshold = dateNow.subtract(24, 'hours')
    // `lastStashEntryCheck` being equal to `null` means
    // we've never checked for the given repo
    if (lastStashEntryCheck == null || threshold.isAfter(lastStashEntryCheck)) {
      await this.repositoriesStore.updateLastStashCheckDate(repository)
      const numEntriesCreatedOutsideDesktop =
        stashEntryCount - desktopStashEntryCount
      this.statsStore.addStashEntriesCreatedOutsideDesktop(
        numEntriesCreatedOutsideDesktop
      )
    }
  }

  /**
   * Update the repository sidebar indicator for the repository
   */
  private async updateSidebarIndicator(
    repository: Repository,
    status: IStatusResult | null
  ): Promise<void> {
    const lookup = this.localRepositoryStateLookup

    if (repository.missing) {
      lookup.delete(repository.id)
      return
    }

    if (status === null) {
      lookup.delete(repository.id)
      return
    }

    lookup.set(repository.id, {
      aheadBehind: status.branchAheadBehind || null,
      changedFilesCount: status.workingDirectory.files.length,
    })
  }
  /**
   * Refresh indicator in repository list for a specific repository
   */
  private refreshIndicatorForRepository = async (repository: Repository) => {
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

    this.updateSidebarIndicator(repository, status)
    this.emitUpdate()

    const lastPush = await inferLastPushForRepository(
      this.accounts,
      gitStore,
      repository
    )

    if (await this.shouldBackgroundFetch(repository, lastPush)) {
      const aheadBehind = await this.fetchForRepositoryIndicator(repository)

      const existing = lookup.get(repository.id)
      lookup.set(repository.id, {
        aheadBehind: aheadBehind,
        // We don't need to update changedFilesCount here since it was already
        // set when calling `updateSidebarIndicator()` with the status object.
        changedFilesCount: existing?.changedFilesCount ?? 0,
      })
      this.emitUpdate()
    }
  }

  private getRepositoriesForIndicatorRefresh = () => {
    // The currently selected repository will get refreshed by both the
    // BackgroundFetcher and the refreshRepository call from the
    // focus event. No point in having the RepositoryIndicatorUpdater do
    // it as well.
    //
    // Note that this method should never leak the actual repositories
    // instance since that's a mutable array. We should always return
    // a copy.
    return this.repositories.filter(x => x !== this.selectedRepository)
  }

  /**
   * A slimmed down version of performFetch which is only used when fetching
   * the repository in order to compute the repository indicator status.
   *
   * As opposed to `performFetch` this method will not perform a full refresh
   * of the repository after fetching, nor will it refresh issues, branch
   * protection information etc. It's intention is to only do the bare minimum
   * amount of work required to calculate an up-to-date ahead/behind status
   * of the current branch to its upstream tracking branch.
   */
  private fetchForRepositoryIndicator(repo: Repository) {
    return this.withAuthenticatingUser(repo, async (repo, account) => {
      const isBackgroundTask = true
      const gitStore = this.gitStoreCache.get(repo)

      await this.withPushPullFetch(repo, () =>
        gitStore.fetch(account, isBackgroundTask, progress =>
          this.updatePushPullFetchProgress(repo, progress)
        )
      )
      this.updatePushPullFetchProgress(repo, null)

      return gitStore.aheadBehind
    })
  }

  public _setRepositoryIndicatorsEnabled(repositoryIndicatorsEnabled: boolean) {
    if (this.repositoryIndicatorsEnabled === repositoryIndicatorsEnabled) {
      return
    }

    setBoolean(repositoryIndicatorsEnabledKey, repositoryIndicatorsEnabled)
    this.repositoryIndicatorsEnabled = repositoryIndicatorsEnabled
    if (repositoryIndicatorsEnabled) {
      this.repositoryIndicatorUpdater.start()
    } else {
      this.repositoryIndicatorUpdater.stop()
    }

    this.emitUpdate()
  }

  public _setCommitSpellcheckEnabled(commitSpellcheckEnabled: boolean) {
    if (this.commitSpellcheckEnabled === commitSpellcheckEnabled) {
      return
    }

    setBoolean(commitSpellcheckEnabledKey, commitSpellcheckEnabled)
    this.commitSpellcheckEnabled = commitSpellcheckEnabled

    this.emitUpdate()
  }

  /**
   * Refresh all the data for the Changes section.
   *
   * This will be called automatically when appropriate.
   */
  private async refreshChangesSection(
    repository: Repository,
    options: {
      includingStatus: boolean
      clearPartialState: boolean
    }
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

  public async _refreshAuthor(repository: Repository): Promise<void> {
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
  public _closePopup(popupType?: PopupType) {
    const currentPopup = this.currentPopup
    if (currentPopup == null) {
      return
    }

    if (popupType !== undefined && currentPopup.type !== popupType) {
      return
    }

    if (currentPopup.type === PopupType.CloneRepository) {
      this._completeOpenInDesktop(() => Promise.resolve(null))
    }

    this.currentPopup = null
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _showFoldout(foldout: Foldout): Promise<void> {
    this.currentFoldout = foldout
    this.emitUpdate()

    // If the user is opening the repository list and we haven't yet
    // started to refresh the repository indicators let's do so.
    if (
      foldout.type === FoldoutType.Repository &&
      this.repositoryIndicatorsEnabled
    ) {
      // N.B: RepositoryIndicatorUpdater.prototype.start is
      // idempotent.
      this.repositoryIndicatorUpdater.start()
    }
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
    startPoint: string | null,
    noTrackOption: boolean = false,
    checkoutBranch: boolean = true
  ): Promise<Branch | undefined> {
    const gitStore = this.gitStoreCache.get(repository)
    const branch = await gitStore.createBranch(name, startPoint, noTrackOption)

    if (branch !== undefined && checkoutBranch) {
      await this._checkoutBranch(repository, branch)
    }

    return branch
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _createTag(repository: Repository, name: string, sha: string) {
    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.createTag(name, sha)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _deleteTag(repository: Repository, name: string) {
    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.deleteTag(name)
  }

  private updateCheckoutProgress(
    repository: Repository,
    checkoutProgress: ICheckoutProgress | null
  ) {
    this.repositoryStateCache.update(repository, () => ({
      checkoutProgress,
    }))

    if (
      this.selectedRepository instanceof Repository &&
      this.selectedRepository.id === repository.id
    ) {
      this.emitUpdate()
    }
  }

  /**
   * Checkout the given branch, using given stashing strategy or the default.
   *
   * When `explicitStrategy` is undefined we'll use the default strategy
   * configurable by the user in preferences. Without an explicit strategy
   * this method will take care of presenting the user with any necessary
   * confirmation dialogs and choices depending on the state of their
   * repository.
   *
   * When provided with an explicit strategy other than `AskForConfirmation`
   * we assume the user has been informed of any risks of overwritten stashes
   * and such. In other words the only consumers who should pass an explicit
   * strategy are dialogs and other confirmation constructs where the user
   * has made an explicit choice about how to proceed.
   *
   * Note: This shouldn't be called directly. See `Dispatcher`.
   */
  public async _checkoutBranch(
    repository: Repository,
    branch: Branch,
    explicitStrategy?: UncommittedChangesStrategy
  ): Promise<Repository> {
    const repositoryState = this.repositoryStateCache.get(repository)
    const { changesState, branchesState } = repositoryState
    const { currentBranchProtected, stashEntry } = changesState
    const { tip } = branchesState
    const hasChanges = changesState.workingDirectory.files.length > 0

    // No point in checking out the currently checked out branch.
    if (tip.kind === TipState.Valid && tip.branch.name === branch.name) {
      return repository
    }

    let strategy = explicitStrategy ?? this.uncommittedChangesStrategy

    // The user hasn't been presented with an explicit choice
    if (explicitStrategy === undefined) {
      // Even if the user has chosen to "always stash on current branch" in
      // preferences we still want to let them know changes might be lost
      if (strategy === UncommittedChangesStrategy.StashOnCurrentBranch) {
        if (hasChanges && stashEntry !== null) {
          const type = PopupType.ConfirmOverwriteStash
          this._showPopup({ type, repository, branchToCheckout: branch })
          return repository
        }
      }
    }

    // Always move changes to new branch if we're on a detached head, unborn
    // branch, or a protected branch.
    if (tip.kind !== TipState.Valid || currentBranchProtected) {
      strategy = UncommittedChangesStrategy.MoveToNewBranch
    }

    if (strategy === UncommittedChangesStrategy.AskForConfirmation) {
      if (hasChanges) {
        const type = PopupType.StashAndSwitchBranch
        this._showPopup({ type, branchToCheckout: branch, repository })
        return repository
      }
    }

    return this.withAuthenticatingUser(repository, (repository, account) => {
      // We always want to end with refreshing the repository regardless of
      // whether the checkout succeeded or not in order to present the most
      // up-to-date information to the user.
      return this.checkoutImplementation(repository, branch, account, strategy)
        .then(() => this.onSuccessfulCheckout(repository, branch))
        .catch(e => this.emitError(new CheckoutError(e, repository, branch)))
        .then(() => this.refreshAfterCheckout(repository, branch))
        .finally(() => this.updateCheckoutProgress(repository, null))
    })
  }

  /** Invoke the best checkout implementation for the selected strategy */
  private checkoutImplementation(
    repository: Repository,
    branch: Branch,
    account: IGitAccount | null,
    strategy: UncommittedChangesStrategy
  ) {
    if (strategy === UncommittedChangesStrategy.StashOnCurrentBranch) {
      return this.checkoutAndLeaveChanges(repository, branch, account)
    } else if (strategy === UncommittedChangesStrategy.MoveToNewBranch) {
      return this.checkoutAndBringChanges(repository, branch, account)
    } else {
      return this.checkoutIgnoringChanges(repository, branch, account)
    }
  }

  /** Checkout the given branch without taking local changes into account */
  private async checkoutIgnoringChanges(
    repository: Repository,
    branch: Branch,
    account: IGitAccount | null
  ) {
    await checkoutBranch(repository, account, branch, progress => {
      this.updateCheckoutProgress(repository, progress)
    })
  }

  /**
   * Checkout the given branch and leave any local changes on the current branch
   *
   * Note that this will ovewrite any existing stash enty on the current branch.
   */
  private async checkoutAndLeaveChanges(
    repository: Repository,
    branch: Branch,
    account: IGitAccount | null
  ) {
    const repositoryState = this.repositoryStateCache.get(repository)
    const { workingDirectory } = repositoryState.changesState
    const { tip } = repositoryState.branchesState

    if (tip.kind === TipState.Valid && workingDirectory.files.length > 0) {
      await this.createStashAndDropPreviousEntry(repository, tip.branch)
      this.statsStore.recordStashCreatedOnCurrentBranch()
    }

    return this.checkoutIgnoringChanges(repository, branch, account)
  }

  /**
   * Checkout the given branch and move any local changes along.
   *
   * Will attempt to simply check out the branch and if that fails due to
   * local changes risking being overwritten it'll create a transient stash
   * entry, switch branches, and pop said stash entry.
   *
   * Note that the transient stash entry will not overwrite any current stash
   * entry for the target branch.
   */
  private async checkoutAndBringChanges(
    repository: Repository,
    branch: Branch,
    account: IGitAccount | null
  ) {
    try {
      await this.checkoutIgnoringChanges(repository, branch, account)
    } catch (checkoutError) {
      if (!isLocalChangesOverwrittenError(checkoutError)) {
        throw checkoutError
      }

      const stash = (await this.createStashEntry(repository, branch))
        ? await getLastDesktopStashEntryForBranch(repository, branch)
        : null

      // Failing to stash the changes when we know that there are changes
      // preventing a checkout is very likely due to assume-unchanged or
      // skip-worktree. So instead of showing a "could not create stash" error
      // we'll show the checkout error to the user and let them figure it out.
      if (stash === null) {
        throw checkoutError
      }

      await this.checkoutIgnoringChanges(repository, branch, account)
      await popStashEntry(repository, stash.stashSha)

      this.statsStore.recordChangesTakenToNewBranch()
    }
  }

  private async onSuccessfulCheckout(repository: Repository, branch: Branch) {
    const repositoryState = this.repositoryStateCache.get(repository)
    const { stashEntry } = repositoryState.changesState
    const { defaultBranch } = repositoryState.branchesState

    this.clearBranchProtectionState(repository)

    // Make sure changes or suggested next step are visible after branch checkout
    await this._selectWorkingDirectoryFiles(repository)

    this._initializeCompare(repository, { kind: HistoryTabMode.History })

    if (defaultBranch !== null && branch.name !== defaultBranch.name) {
      this.statsStore.recordNonDefaultBranchCheckout()
    }

    if (stashEntry !== null && !this.hasUserViewedStash) {
      this.statsStore.recordStashNotViewedAfterCheckout()
    }

    this.hasUserViewedStash = false
  }

  private async refreshAfterCheckout(repository: Repository, branch: Branch) {
    this.updateCheckoutProgress(repository, {
      kind: 'checkout',
      title: `Refreshing ${__DARWIN__ ? 'Repository' : 'repository'}`,
      value: 1,
      targetBranch: branch.name,
    })

    await this._refreshRepository(repository)
    return repository
  }

  /**
   * Creates a stash associated to the current checked out branch.
   *
   * @param repository
   * @param showConfirmationDialog  Whether to show a confirmation
   *                                dialog if an existing stash exists.
   */
  public async _createStashForCurrentBranch(
    repository: Repository,
    showConfirmationDialog: boolean
  ): Promise<boolean> {
    const repositoryState = this.repositoryStateCache.get(repository)
    const tip = repositoryState.branchesState.tip
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null
    const hasExistingStash = repositoryState.changesState.stashEntry !== null

    if (currentBranch === null) {
      return false
    }

    if (showConfirmationDialog && hasExistingStash) {
      this._showPopup({
        type: PopupType.ConfirmOverwriteStash,
        branchToCheckout: null,
        repository,
      })
      return false
    }

    if (await this.createStashAndDropPreviousEntry(repository, currentBranch)) {
      this.statsStore.recordStashCreatedOnCurrentBranch()
      await this._refreshRepository(repository)
      return true
    }

    return false
  }

  /**
   * refetches the associated GitHub remote repository, if possible
   *
   * if refetching fails, will return the given `repository` with
   * the same info it was passed in with
   *
   * @param repository
   * @returns repository model (hopefully with fresh `gitHubRepository` info)
   */
  private async repositoryWithRefreshedGitHubRepository(
    repository: Repository
  ): Promise<Repository> {
    const repoStore = this.repositoriesStore
    const match = await this.matchGitHubRepository(repository)

    // TODO: We currently never clear GitHub repository associations (see
    // https://github.com/desktop/desktop/issues/1144). So we can bail early at
    // this point.
    if (!match) {
      return repository
    }

    const { account, owner, name } = match
    const { endpoint } = account
    const api = API.fromAccount(account)
    const apiRepo = await api.fetchRepository(owner, name)

    if (apiRepo === null) {
      // If the request fails, we want to preserve the existing GitHub
      // repository info. But if we didn't have a GitHub repository already or
      // the endpoint changed, the skeleton repository is better than nothing.
      if (endpoint !== repository.gitHubRepository?.endpoint) {
        const ghRepo = await repoStore.upsertGitHubRepositoryFromMatch(match)
        return repoStore.setGitHubRepository(repository, ghRepo)
      }

      return repository
    }

    if (repository.gitHubRepository) {
      const gitStore = this.gitStoreCache.get(repository)
      await updateRemoteUrl(gitStore, repository.gitHubRepository, apiRepo)
    }

    const ghRepo = await repoStore.upsertGitHubRepository(endpoint, apiRepo)
    const freshRepo = await repoStore.setGitHubRepository(repository, ghRepo)

    await this.refreshBranchProtectionState(freshRepo)
    return freshRepo
  }

  private async updateBranchProtectionsFromAPI(repository: Repository) {
    if (repository.gitHubRepository === null) {
      return
    }

    const { owner, name } = repository.gitHubRepository

    const account = getAccountForEndpoint(
      this.accounts,
      repository.gitHubRepository.endpoint
    )

    if (account === null) {
      return
    }

    const api = API.fromAccount(account)

    const branches = await api.fetchProtectedBranches(owner.login, name)

    await this.repositoriesStore.updateBranchProtections(
      repository.gitHubRepository,
      branches
    )
  }

  private async matchGitHubRepository(
    repository: Repository
  ): Promise<IMatchedGitHubRepository | null> {
    const gitStore = this.gitStoreCache.get(repository)

    if (!gitStore.defaultRemote) {
      await gitStore.loadRemotes()
    }

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
  public async _changeRepositoryAlias(
    repository: Repository,
    newAlias: string | null
  ): Promise<void> {
    return this.repositoriesStore.updateRepositoryAlias(repository, newAlias)
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
    includeUpstream?: boolean,
    toCheckout?: Branch | null
  ): Promise<void> {
    return this.withAuthenticatingUser(repository, async (r, account) => {
      const gitStore = this.gitStoreCache.get(r)

      // If solely a remote branch, there is no need to checkout a branch.
      if (branch.type === BranchType.Remote) {
        const { remoteName, tip, nameWithoutRemote } = branch
        if (remoteName === null) {
          // This is based on the branches ref. It should not be null for a
          // remote branch
          throw new Error(
            `Could not determine remote name from: ${branch.ref}.`
          )
        }

        await gitStore.performFailableOperation(() =>
          deleteRemoteBranch(r, account, remoteName, nameWithoutRemote)
        )

        // We log the remote branch's sha so that the user can recover it.
        log.info(
          `Deleted branch ${branch.upstreamWithoutRemote} (was ${tip.sha})`
        )

        return this._refreshRepository(r)
      }

      // If a local branch, user may have the branch to delete checked out and
      // we need to switch to a different branch (default or recent).
      const branchToCheckout =
        toCheckout ?? this.getBranchToCheckoutAfterDelete(branch, r)

      if (branchToCheckout !== null) {
        await gitStore.performFailableOperation(() =>
          checkoutBranch(r, account, branchToCheckout)
        )
      }

      await gitStore.performFailableOperation(() => {
        return this.deleteLocalBranchAndUpstreamBranch(
          repository,
          branch,
          account,
          includeUpstream
        )
      })

      return this._refreshRepository(r)
    })
  }

  /**
   * Deletes the local branch. If the parameter `includeUpstream` is true, the
   * upstream branch will be deleted also.
   */
  private async deleteLocalBranchAndUpstreamBranch(
    repository: Repository,
    branch: Branch,
    account: IGitAccount | null,
    includeUpstream?: boolean
  ): Promise<void> {
    await deleteLocalBranch(repository, branch.name)

    if (
      includeUpstream === true &&
      branch.upstreamRemoteName !== null &&
      branch.upstreamWithoutRemote !== null
    ) {
      await deleteRemoteBranch(
        repository,
        account,
        branch.upstreamRemoteName,
        branch.upstreamWithoutRemote
      )
    }
    return
  }

  private getBranchToCheckoutAfterDelete(
    branchToDelete: Branch,
    repository: Repository
  ): Branch | null {
    const { branchesState } = this.repositoryStateCache.get(repository)
    const tip = branchesState.tip
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null
    // if current branch is not the branch being deleted, no need to switch
    // branches
    if (currentBranch !== null && branchToDelete.name !== currentBranch.name) {
      return null
    }

    // If the default branch is null, use the most recent branch excluding the branch
    // the branch to delete as the branch to checkout.
    const branchToCheckout =
      branchesState.defaultBranch ??
      branchesState.recentBranches.find(x => x.name !== branchToDelete.name)

    if (branchToCheckout === undefined) {
      throw new Error(
        `It's not possible to delete the only existing branch in a repository.`
      )
    }

    return branchToCheckout
  }

  private updatePushPullFetchProgress(
    repository: Repository,
    pushPullFetchProgress: Progress | null
  ) {
    this.repositoryStateCache.update(repository, () => ({
      pushPullFetchProgress,
    }))
    if (enableProgressBarOnIcon()) {
      if (pushPullFetchProgress !== null) {
        remote.getCurrentWindow().setProgressBar(pushPullFetchProgress.value)
      } else {
        remote.getCurrentWindow().setProgressBar(-1)
      }
    }
    if (this.selectedRepository === repository) {
      this.emitUpdate()
    }
  }

  public async _push(
    repository: Repository,
    options?: PushOptions
  ): Promise<void> {
    return this.withAuthenticatingUser(repository, (repository, account) => {
      return this.performPush(repository, account, options)
    })
  }

  private async performPush(
    repository: Repository,
    account: IGitAccount | null,
    options?: PushOptions
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

        const remoteName = branch.upstreamRemoteName || remote.name

        const pushTitle = `Pushing to ${remoteName}`

        // Emit an initial progress even before our push begins
        // since we're doing some work to get remotes up front.
        this.updatePushPullFetchProgress(repository, {
          kind: 'push',
          title: pushTitle,
          value: 0,
          remote: remoteName,
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

        // This is most likely not necessary and is only here out of
        // an abundance of caution. We're introducing support for
        // automatically configuring Git proxies based on system
        // proxy settings and therefore need to pass along the remote
        // url to functions such as push, pull, fetch etc.
        //
        // Prior to this we relied primarily on the `branch.remote`
        // property and used the `remote.name` as a fallback in case the
        // branch object didn't have a remote name (i.e. if it's not
        // published yet).
        //
        // The remote.name is derived from the current tip first and falls
        // back to using the defaultRemote if the current tip isn't valid
        // or if the current branch isn't published. There's however no
        // guarantee that they'll be refreshed at the exact same time so
        // there's a theoretical possibility that `branch.remote` and
        // `remote.name` could be out of sync. I have no reason to suspect
        // that's the case and if it is then we already have problems as
        // the `fetchRemotes` call after the push already relies on the
        // `remote` and not the `branch.remote`. All that said this is
        // a critical path in the app and somehow breaking pushing would
        // be near unforgivable so I'm introducing this `safeRemote`
        // temporarily to ensure that there's no risk of us using an
        // out of sync remote name while still providing envForRemoteOperation
        // with an url to use when resolving proxies.
        //
        // I'm also adding a non fatal exception if this ever happens
        // so that we can confidently remove this safeguard in a future
        // release.
        const safeRemote: IRemote = { name: remoteName, url: remote.url }

        if (safeRemote.name !== remote.name) {
          sendNonFatalException(
            'remoteNameMismatch',
            new Error('The current remote name differs from the branch remote')
          )
        }

        const gitStore = this.gitStoreCache.get(repository)
        await gitStore.performFailableOperation(
          async () => {
            await pushRepo(
              repository,
              account,
              safeRemote,
              branch.name,
              branch.upstreamWithoutRemote,
              gitStore.tagsToPush,
              options,
              progress => {
                this.updatePushPullFetchProgress(repository, {
                  ...progress,
                  title: pushTitle,
                  value: pushWeight * progress.value,
                })
              }
            )
            gitStore.clearTagsToPush()

            await gitStore.fetchRemotes(
              account,
              [safeRemote],
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
              description: 'Fast-forwarding branches',
              value: refreshStartProgress,
            })

            await this.fastForwardBranches(repository)

            this.updatePushPullFetchProgress(repository, {
              kind: 'generic',
              title: refreshTitle,
              value: refreshStartProgress + refreshWeight * 0.5,
            })

            // manually refresh branch protections after the push, to ensure
            // any new branch will immediately report as protected
            await this.refreshBranchProtectionState(repository)

            await this._refreshRepository(repository)
          },
          { retryAction }
        )

        this.updatePushPullFetchProgress(repository, null)

        this.updateMenuLabelsForSelectedRepository()

        // Note that we're using `getAccountForRepository` here instead
        // of the `account` instance we've got and that's because recordPush
        // needs to be able to differentiate between a GHES account and a
        // generic account and it can't do that only based on the endpoint.
        this.statsStore.recordPush(
          getAccountForRepository(this.accounts, repository),
          options
        )
      }
    })
  }

  private async withIsCommitting(
    repository: Repository,
    fn: () => Promise<boolean>
  ): Promise<boolean> {
    const state = this.repositoryStateCache.get(repository)
    // ensure the user doesn't try and commit again
    if (state.isCommitting) {
      return false
    }

    this.repositoryStateCache.update(repository, () => ({
      isCommitting: true,
    }))
    this.emitUpdate()

    try {
      return await fn()
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
        let gitContext: GitErrorContext | undefined = undefined

        if (tip.branch.upstream !== null) {
          mergeBase = await getMergeBase(
            repository,
            tip.branch.name,
            tip.branch.upstream
          )

          gitContext = {
            kind: 'pull',
            theirBranch: tip.branch.upstream,
            currentBranch: tip.branch.name,
          }
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

          if (gitStore.pullWithRebase) {
            this.statsStore.recordPullWithRebaseEnabled()
          } else {
            this.statsStore.recordPullWithDefaultSetting()
          }

          await gitStore.performFailableOperation(
            () =>
              pullRepo(repository, account, remote, progress => {
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
            description: 'Fast-forwarding branches',
            value: refreshStartProgress,
          })

          await this.fastForwardBranches(repository)

          this.updatePushPullFetchProgress(repository, {
            kind: 'generic',
            title: refreshTitle,
            value: refreshStartProgress + refreshWeight * 0.5,
          })

          if (mergeBase) {
            await gitStore.reconcileHistory(mergeBase)
          }

          // manually refresh branch protections after the push, to ensure
          // any new branch will immediately report as protected
          await this.refreshBranchProtectionState(repository)

          await this._refreshRepository(repository)
        } finally {
          this.updatePushPullFetchProgress(repository, null)
        }
      }
    })
  }

  private async fastForwardBranches(repository: Repository) {
    try {
      const eligibleBranches = await getBranchesDifferingFromUpstream(
        repository
      )

      await fastForwardBranches(repository, eligibleBranches)
    } catch (e) {
      log.error('Branch fast-forwarding failed', e)
      sendNonFatalException('fastForwardBranches', e)
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _publishRepository(
    repository: Repository,
    name: string,
    description: string,
    private_: boolean,
    account: Account,
    org: IAPIOrganization | null
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
    const account = matchGitHubRepository(this.accounts, remote)?.account
    if (account !== undefined) {
      const hasValidToken =
        account.token.length > 0 ? 'has token' : 'empty token'
      log.info(
        `[AppStore.getAccountForRemoteURL] account found for remote: ${remote} - ${account.login} (${hasValidToken})`
      )
      return account
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
    options?: { branch?: string; defaultBranch?: string }
  ): {
    promise: Promise<boolean>
    repository: CloningRepository
  } {
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

  public async _discardChangesFromSelection(
    repository: Repository,
    filePath: string,
    diff: ITextDiff,
    selection: DiffSelection
  ) {
    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.discardChangesFromSelection(filePath, diff, selection)

    return this._refreshRepository(repository)
  }

  public async _undoCommit(
    repository: Repository,
    commit: Commit
  ): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)

    await gitStore.undoCommit(commit)

    const { commitSelection } = this.repositoryStateCache.get(repository)

    if (
      commitSelection.shas.length > 0 &&
      commitSelection.shas.find(sha => sha === commit.sha) !== undefined
    ) {
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
          description: 'Fast-forwarding branches',
          value: fetchWeight,
        })

        await this.fastForwardBranches(repository)

        this.updatePushPullFetchProgress(repository, {
          kind: 'generic',
          title: refreshTitle,
          value: fetchWeight + refreshWeight * 0.5,
        })

        // manually refresh branch protections after the push, to ensure
        // any new branch will immediately report as protected
        await this.refreshBranchProtectionState(repository)

        await this._refreshRepository(repository)
      } finally {
        this.updatePushPullFetchProgress(repository, null)

        if (fetchType === FetchType.UserInitiatedTask) {
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
    mergeStatus: MergeTreeResult | null
  ): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)

    if (mergeStatus !== null) {
      if (mergeStatus.kind === ComputedAction.Clean) {
        this.statsStore.recordMergeHintSuccessAndUserProceeded()
      } else if (mergeStatus.kind === ComputedAction.Conflicts) {
        this.statsStore.recordUserProceededAfterConflictWarning()
      } else if (mergeStatus.kind === ComputedAction.Loading) {
        this.statsStore.recordUserProceededWhileLoading()
      }
    }

    const mergeResult = await gitStore.merge(branch)
    const { tip } = gitStore

    if (mergeResult === MergeResult.Success && tip.kind === TipState.Valid) {
      this._setBanner({
        type: BannerType.SuccessfulMerge,
        ourBranch: tip.branch.name,
        theirBranch: branch,
      })
    } else if (
      mergeResult === MergeResult.AlreadyUpToDate &&
      tip.kind === TipState.Valid
    ) {
      this._setBanner({
        type: BannerType.BranchAlreadyUpToDate,
        ourBranch: tip.branch.name,
        theirBranch: branch,
      })
    }

    return this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _setRebaseProgressFromState(repository: Repository) {
    const snapshot = await getRebaseSnapshot(repository)
    if (snapshot === null) {
      return
    }

    const { progress, commits } = snapshot

    this.repositoryStateCache.updateRebaseState(repository, () => {
      return {
        progress,
        commits,
      }
    })
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _initializeRebaseProgress(
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ) {
    this.repositoryStateCache.updateRebaseState(repository, () => {
      const hasCommits = commits.length > 0
      const firstCommitSummary = hasCommits ? commits[0].summary : null

      return {
        progress: {
          value: formatRebaseValue(0),
          rebasedCommitCount: 0,
          currentCommitSummary: firstCommitSummary,
          totalCommitCount: commits.length,
        },
        commits,
      }
    })

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _setConflictsResolved(repository: Repository) {
    // an update is not emitted here because there is no need
    // to trigger a re-render at this point

    this.repositoryStateCache.updateRebaseState(repository, () => ({
      userHasResolvedConflicts: true,
    }))
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _setRebaseFlowStep(
    repository: Repository,
    step: RebaseFlowStep
  ): Promise<void> {
    this.repositoryStateCache.updateRebaseState(repository, () => ({
      step,
    }))

    this.emitUpdate()

    if (step.kind === RebaseStep.ShowProgress && step.rebaseAction !== null) {
      // this timeout is intended to defer the action from running immediately
      // after the progress UI is shown, to better show that rebase is
      // progressing rather than suddenly appearing and disappearing again
      await sleep(500)
      await step.rebaseAction()
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _endRebaseFlow(repository: Repository) {
    this.repositoryStateCache.updateRebaseState(repository, () => ({
      step: null,
      progress: null,
      commits: null,
      preview: null,
      userHasResolvedConflicts: false,
    }))

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _rebase(
    repository: Repository,
    baseBranch: Branch,
    targetBranch: Branch
  ): Promise<RebaseResult> {
    const progressCallback = (progress: IRebaseProgress) => {
      this.repositoryStateCache.updateRebaseState(repository, () => ({
        progress,
      }))

      this.emitUpdate()
    }

    const gitStore = this.gitStoreCache.get(repository)
    const result = await gitStore.performFailableOperation(
      () => rebase(repository, baseBranch, targetBranch, progressCallback),
      {
        retryAction: {
          type: RetryActionType.Rebase,
          repository,
          baseBranch,
          targetBranch,
        },
      }
    )

    return result || RebaseResult.Error
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _abortRebase(repository: Repository) {
    const gitStore = this.gitStoreCache.get(repository)
    return await gitStore.performFailableOperation(() =>
      abortRebase(repository)
    )
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _continueRebase(
    repository: Repository,
    workingDirectory: WorkingDirectoryStatus,
    manualResolutions: ReadonlyMap<string, ManualConflictResolution>
  ): Promise<RebaseResult> {
    const progressCallback = (progress: IRebaseProgress) => {
      this.repositoryStateCache.updateRebaseState(repository, () => ({
        progress,
      }))

      this.emitUpdate()
    }

    const gitStore = this.gitStoreCache.get(repository)
    const result = await gitStore.performFailableOperation(() =>
      continueRebase(
        repository,
        workingDirectory.files,
        manualResolutions,
        progressCallback
      )
    )

    return result || RebaseResult.Error
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _abortMerge(repository: Repository): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)
    return await gitStore.performFailableOperation(() => abortMerge(repository))
  }

  /** This shouldn't be called directly. See `Dispatcher`.
   *  This method only used in the Merge Conflicts dialog flow,
   *  not committing a conflicted merge via the "Changes" pane.
   */
  public async _finishConflictedMerge(
    repository: Repository,
    workingDirectory: WorkingDirectoryStatus,
    manualResolutions: Map<string, ManualConflictResolution>
  ): Promise<string | undefined> {
    /**
     *  The assumption made here is that all other files that were part of this merge
     *  have already been staged by git automatically (or manually by the user via CLI).
     *  When the user executes a merge and there are conflicts,
     *  git stages all files that are part of the merge that _don't_ have conflicts
     *  This means that we only need to stage the conflicted files
     *  (whether they are manual or markered) to get all changes related to
     *  this merge staged. This also means that any uncommitted changes in the index
     *  that were in place before the merge was started will _not_ be included, unless
     *  the user stages them manually via CLI.
     *
     *  Its also worth noting this method only used in the Merge Conflicts dialog flow, not committing a conflicted merge via the "Changes" pane.
     *
     *  *TLDR we only stage conflicts here because git will have already staged the rest of the changes related to this merge.*
     */
    const conflictedFiles = workingDirectory.files.filter(f => {
      return f.status.kind === AppFileStatusKind.Conflicted
    })
    const gitStore = this.gitStoreCache.get(repository)
    return await gitStore.performFailableOperation(() =>
      createMergeCommit(repository, conflictedFiles, manualResolutions)
    )
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _setRemoteURL(
    repository: Repository,
    name: string,
    url: string
  ): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.setRemoteURL(name, url)
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
            `No suitable editors installed for GitHub Desktop to launch. Install ${suggestedExternalEditor.name} for your platform and restart GitHub Desktop to try again.`,
            { suggestDefaultEditor: true }
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

  /** Set whether the user has opted out of stats reporting. */
  public async setStatsOptOut(
    optOut: boolean,
    userViewedPrompt: boolean
  ): Promise<void> {
    await this.statsStore.setOptOut(optOut, userViewedPrompt)

    this.emitUpdate()
  }

  public _setAskToMoveToApplicationsFolderSetting(
    value: boolean
  ): Promise<void> {
    this.askToMoveToApplicationsFolderSetting = value

    setBoolean(askToMoveToApplicationsFolderKey, value)
    this.emitUpdate()

    return Promise.resolve()
  }

  public _setConfirmRepositoryRemovalSetting(
    confirmRepoRemoval: boolean
  ): Promise<void> {
    this.askForConfirmationOnRepositoryRemoval = confirmRepoRemoval
    setBoolean(confirmRepoRemovalKey, confirmRepoRemoval)

    this.updateMenuLabelsForSelectedRepository()

    this.emitUpdate()

    return Promise.resolve()
  }

  public _setConfirmDiscardChangesSetting(value: boolean): Promise<void> {
    this.confirmDiscardChanges = value

    setBoolean(confirmDiscardChangesKey, value)
    this.emitUpdate()

    return Promise.resolve()
  }

  public _setConfirmForcePushSetting(value: boolean): Promise<void> {
    this.askForConfirmationOnForcePush = value
    setBoolean(confirmForcePushKey, value)

    this.updateMenuLabelsForSelectedRepository()

    this.emitUpdate()

    return Promise.resolve()
  }

  public _setUncommittedChangesStrategySetting(
    value: UncommittedChangesStrategy
  ): Promise<void> {
    this.uncommittedChangesStrategy = value

    localStorage.setItem(uncommittedChangesStrategyKey, value)

    this.emitUpdate()
    return Promise.resolve()
  }

  public _setExternalEditor(selectedEditor: string) {
    const promise = this.updateSelectedExternalEditor(selectedEditor)
    localStorage.setItem(externalEditorKey, selectedEditor)
    this.emitUpdate()

    this.updateMenuLabelsForSelectedRepository()
    return promise
  }

  public _setShell(shell: Shell): Promise<void> {
    this.selectedShell = shell
    localStorage.setItem(shellKey, shell)
    this.emitUpdate()

    this.updateMenuLabelsForSelectedRepository()

    return Promise.resolve()
  }

  public _changeImageDiffType(type: ImageDiffType): Promise<void> {
    this.imageDiffType = type
    localStorage.setItem(imageDiffTypeKey, JSON.stringify(this.imageDiffType))
    this.emitUpdate()

    return Promise.resolve()
  }

  public _setHideWhitespaceInChangesDiff(
    hideWhitespaceInDiff: boolean,
    repository: Repository
  ): Promise<void> {
    setBoolean(hideWhitespaceInChangesDiffKey, hideWhitespaceInDiff)
    this.hideWhitespaceInChangesDiff = hideWhitespaceInDiff

    return this.refreshChangesSection(repository, {
      includingStatus: true,
      clearPartialState: true,
    })
  }

  public _setHideWhitespaceInHistoryDiff(
    hideWhitespaceInDiff: boolean,
    repository: Repository,
    file: CommittedFileChange | null
  ): Promise<void> {
    setBoolean(hideWhitespaceInHistoryDiffKey, hideWhitespaceInDiff)
    this.hideWhitespaceInHistoryDiff = hideWhitespaceInDiff

    if (file === null) {
      return this.updateChangesWorkingDirectoryDiff(repository)
    } else {
      return this._changeFileSelection(repository, file)
    }
  }

  public _setShowSideBySideDiff(showSideBySideDiff: boolean) {
    if (showSideBySideDiff !== this.showSideBySideDiff) {
      setShowSideBySideDiff(showSideBySideDiff)
      this.showSideBySideDiff = showSideBySideDiff
      this.statsStore.recordDiffModeChanged()
      this.emitUpdate()
    }
  }

  public _setUpdateBannerVisibility(visibility: boolean) {
    this.isUpdateAvailableBannerVisible = visibility

    this.emitUpdate()
  }

  public _setBanner(state: Banner) {
    this.currentBanner = state
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _clearBanner(bannerType?: BannerType) {
    const { currentBanner } = this
    if (currentBanner === null) {
      return
    }

    if (bannerType !== undefined && currentBanner.type !== bannerType) {
      return
    }

    this.currentBanner = null
    this.emitUpdate()
  }

  public _reportStats() {
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

    if (this.appIsFocused) {
      this.repositoryIndicatorUpdater.resume()
      if (this.selectedRepository instanceof Repository) {
        this.startPullRequestUpdater(this.selectedRepository)
        // if we're in the tutorial and we don't have an editor yet, check for one!
        if (this.currentOnboardingTutorialStep === TutorialStep.PickEditor) {
          await this._resolveCurrentEditor()
        }
      }
    } else {
      this.repositoryIndicatorUpdater.pause()
      this.stopPullRequestUpdater()
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
      `[AppStore] removing account ${account.login} (${account.name}) from store`
    )
    return this.accountsStore.removeAccount(account)
  }

  private async _addAccount(account: Account): Promise<void> {
    log.info(
      `[AppStore] adding account ${account.login} (${account.name}) to store`
    )
    const storedAccount = await this.accountsStore.addAccount(account)

    // If we're in the welcome flow and a user signs in we want to trigger
    // a refresh of the repositories available for cloning straight away
    // in order to have the list of repositories ready for them when they
    // get to the blankslate.
    if (this.showWelcomeFlow && storedAccount !== null) {
      this.apiRepositoriesStore.loadRepositories(storedAccount)
    }
  }

  public _updateRepositoryMissing(
    repository: Repository,
    missing: boolean
  ): Promise<Repository> {
    return this.repositoriesStore.updateRepositoryMissing(repository, missing)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _updateRepositoryWorkflowPreferences(
    repository: Repository,
    workflowPreferences: WorkflowPreferences
  ): Promise<void> {
    await this.repositoriesStore.updateRepositoryWorkflowPreferences(
      repository,
      workflowPreferences
    )
  }

  /**
   * Add a tutorial repository.
   *
   * This method differs from the `_addRepositories` method in that it
   * requires that the repository has been created on the remote and
   * set up to track it. Given that tutorial repositories are created
   * from the no-repositories blank slate it shouldn't be possible for
   * another repository with the same path to exist in the repositories
   * table but in case that hangs in the future this method will set
   * the tutorial flag on the existing repository at the given path.
   */
  public async _addTutorialRepository(
    path: string,
    endpoint: string,
    apiRepository: IAPIFullRepository
  ) {
    const validatedPath = await validatedRepositoryPath(path)
    if (validatedPath) {
      log.info(
        `[AppStore] adding tutorial repository at ${validatedPath} to store`
      )

      await this.repositoriesStore.addTutorialRepository(
        validatedPath,
        endpoint,
        apiRepository
      )
      this.tutorialAssessor.onNewTutorialRepository()
    } else {
      const error = new Error(`${path} isn't a git repository.`)
      this.emitError(error)
    }
  }

  public async _addRepositories(
    paths: ReadonlyArray<string>
  ): Promise<ReadonlyArray<Repository>> {
    const addedRepositories = new Array<Repository>()
    const lfsRepositories = new Array<Repository>()
    const invalidPaths = new Array<string>()

    for (const path of paths) {
      const validatedPath = await validatedRepositoryPath(path)
      if (validatedPath) {
        log.info(`[AppStore] adding repository at ${validatedPath} to store`)

        const repositories = this.repositories
        const existing = matchExistingRepository(repositories, validatedPath)

        // We don't have to worry about repositoryWithRefreshedGitHubRepository
        // and isUsingLFS if the repo already exists in the app.
        if (existing !== undefined) {
          addedRepositories.push(existing)
          continue
        }

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
        invalidPaths.push(path)
      }
    }

    if (invalidPaths.length > 0) {
      this.emitError(new Error(this.getInvalidRepoPathsMessage(invalidPaths)))
    }

    if (lfsRepositories.length > 0) {
      this._showPopup({
        type: PopupType.InitializeLFS,
        repositories: lfsRepositories,
      })
    }

    return addedRepositories
  }

  public async _removeRepository(
    repository: Repository | CloningRepository,
    moveToTrash: boolean
  ): Promise<void> {
    try {
      if (moveToTrash) {
        const deleted = shell.moveItemToTrash(repository.path)

        if (!deleted) {
          this.emitError(
            new Error(
              `Failed moving repository directory to ${TrashNameLabel}.\n\nA common reason for this is if a file or directory is open in another program.`
            )
          )
          return
        }
      }

      if (repository instanceof CloningRepository) {
        this._removeCloningRepository(repository)
      } else {
        await this.repositoriesStore.removeRepository(repository)
      }
    } catch (err) {
      this.emitError(err)
      return
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

  private getInvalidRepoPathsMessage(
    invalidPaths: ReadonlyArray<string>
  ): string {
    if (invalidPaths.length === 1) {
      return `${invalidPaths} isn't a Git repository.`
    }

    return `The following paths aren't Git repositories:\n\n${invalidPaths
      .slice(0, MaxInvalidFoldersToDisplay)
      .map(path => `- ${path}`)
      .join('\n')}${
      invalidPaths.length > MaxInvalidFoldersToDisplay
        ? `\n\n(and ${invalidPaths.length - MaxInvalidFoldersToDisplay} more)`
        : ''
    }`
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
        `[AppStore.withAuthenticatingUser] account found for repository: ${repository.name} - ${account.login} (${hasValidToken})`
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

  public _changeBranchesTab(tab: BranchesTab): Promise<void> {
    this.selectedBranchesTab = tab

    this.emitUpdate()

    return Promise.resolve()
  }

  public async _showGitHubExplore(repository: Repository): Promise<void> {
    const { gitHubRepository } = repository
    if (!gitHubRepository || gitHubRepository.htmlURL === null) {
      return
    }

    const url = new URL(gitHubRepository.htmlURL)
    url.pathname = '/explore'

    await this._openInBrowser(url.toString())
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
    // no pull requests from non github repos
    if (repository.gitHubRepository === null) {
      return
    }

    const currentPullRequest = this.repositoryStateCache.get(repository)
      .branchesState.currentPullRequest

    if (currentPullRequest === null) {
      return
    }
    const { htmlURL: baseRepoUrl } = currentPullRequest.base.gitHubRepository

    if (baseRepoUrl === null) {
      return
    }

    const showPrUrl = `${baseRepoUrl}/pull/${currentPullRequest.pullRequestNumber}`

    await this._openInBrowser(showPrUrl)
  }

  public async _refreshPullRequests(repository: Repository): Promise<void> {
    if (isRepositoryWithGitHubRepository(repository)) {
      const account = getAccountForRepository(this.accounts, repository)
      if (account !== null) {
        await this.pullRequestCoordinator.refreshPullRequests(
          repository,
          account
        )
      }
    }
  }

  private async onPullRequestChanged(
    repository: Repository,
    openPullRequests: ReadonlyArray<PullRequest>
  ) {
    this.repositoryStateCache.updateBranchesState(repository, () => {
      return { openPullRequests }
    })

    this.updateCurrentPullRequest(repository)
    this.gitStoreCache.get(repository).pruneForkedRemotes(openPullRequests)

    const selectedState = this.getSelectedState()

    // Update menu labels if the currently selected repository is the
    // repository for which we received an update.
    if (selectedState && selectedState.type === SelectionType.Repository) {
      if (selectedState.repository.id === repository.id) {
        this.updateMenuLabelsForSelectedRepository()
      }
    }
    this.emitUpdate()
  }

  private updateCurrentPullRequest(repository: Repository) {
    const gitHubRepository = repository.gitHubRepository

    if (!gitHubRepository) {
      return
    }

    this.repositoryStateCache.updateBranchesState(repository, state => {
      let currentPullRequest: PullRequest | null = null

      const { remote } = this.repositoryStateCache.get(repository)

      if (state.tip.kind === TipState.Valid && remote) {
        currentPullRequest = findAssociatedPullRequest(
          state.tip.branch,
          state.openPullRequests,
          remote
        )
      }

      return { currentPullRequest }
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
    const baseURL = `${gitHubRepository.htmlURL}/pull/new/${urlEncodedBranchName}`

    await this._openInBrowser(baseURL)

    if (this.currentOnboardingTutorialStep === TutorialStep.OpenPullRequest) {
      this._markPullRequestTutorialStepAsComplete(repository)
    }
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
    repository: RepositoryWithGitHubRepository,
    prNumber: number,
    headRepoOwner: string,
    headCloneUrl: string,
    headRefName: string
  ): Promise<void> {
    const prBranch = await this._findPullRequestBranch(
      repository,
      prNumber,
      headRepoOwner,
      headCloneUrl,
      headRefName
    )
    if (prBranch !== undefined) {
      await this._checkoutBranch(repository, prBranch)
      this.statsStore.recordPRBranchCheckout()
    }
  }

  public async _findPullRequestBranch(
    repository: RepositoryWithGitHubRepository,
    prNumber: number,
    headRepoOwner: string,
    headCloneUrl: string,
    headRefName: string
  ): Promise<Branch | undefined> {
    const gitStore = this.gitStoreCache.get(repository)
    const remotes = await getRemotes(repository)

    // Find an existing remote (regardless if set up by us or outside of
    // Desktop).
    let remote = remotes.find(r => urlMatchesRemote(headCloneUrl, r))

    // If we can't find one we'll create a Desktop fork remote.
    if (remote === undefined) {
      try {
        const forkRemoteName = forkPullRequestRemoteName(headRepoOwner)
        remote = await addRemote(repository, forkRemoteName, headCloneUrl)
      } catch (e) {
        this.emitError(
          new Error(
            `Couldn't find PR branch, adding remote failed: ${e.message}`
          )
        )
        return
      }
    }

    const remoteRef = `${remote.name}/${headRefName}`

    // Start by trying to find a local branch that is tracking the remote ref.
    let existingBranch = gitStore.allBranches.find(
      x => x.type === BranchType.Local && x.upstream === remoteRef
    )

    // If we found one, let's check it out and get out of here, quick
    if (existingBranch !== undefined) {
      return existingBranch
    }

    const findRemoteBranch = (name: string) =>
      gitStore.allBranches.find(
        x => x.type === BranchType.Remote && x.name === name
      )

    // No such luck, let's see if we can at least find the remote branch then
    existingBranch = findRemoteBranch(remoteRef)

    // It's quite possible that the PR was created after our last fetch of the
    // remote so let's fetch it and then try again.
    if (existingBranch === undefined) {
      try {
        await this._fetchRemote(repository, remote, FetchType.UserInitiatedTask)
        existingBranch = findRemoteBranch(remoteRef)
      } catch (e) {
        log.error(`Failed fetching remote ${remote?.name}`, e)
      }
    }

    if (existingBranch === undefined) {
      this.emitError(
        new Error(
          `Couldn't find branch '${headRefName}' in remote '${remote.name}'. ` +
            `A common cause for this is if the PR author has deleted their ` +
            `branch or their forked repository.`
        )
      )
      return
    }

    // For fork remotes we checkout the ref as pr/[123] instead of using the
    // head ref name since many PRs from forks are created from their default
    // branch so we'll have a very high likelihood of a conflicting local branch
    const isForkRemote =
      remote.name !== gitStore.defaultRemote?.name &&
      remote.name !== gitStore.upstreamRemote?.name

    if (isForkRemote) {
      return await this._createBranch(
        repository,
        `pr/${prNumber}`,
        remoteRef,
        false
      )
    }

    return existingBranch
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

  public async _resolveCurrentEditor() {
    const match = await findEditorOrDefault(this.selectedExternalEditor)
    const resolvedExternalEditor = match != null ? match.editor : null
    if (this.resolvedExternalEditor !== resolvedExternalEditor) {
      this.resolvedExternalEditor = resolvedExternalEditor

      // Make sure we let the tutorial assessor know that we have a new editor
      // in case it's stuck waiting for one to be selected.
      if (this.currentOnboardingTutorialStep === TutorialStep.PickEditor) {
        if (this.selectedRepository instanceof Repository) {
          this.updateCurrentTutorialStep(this.selectedRepository)
        }
      }

      this.emitUpdate()
    }
  }

  public getResolvedExternalEditor = () => {
    return this.resolvedExternalEditor
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

    this.updateRebaseStateAfterManualResolution(repository)
    this.updateCherryPickStateAfterManualResolution(repository)

    this.emitUpdate()
  }

  /**
   * Updates the rebase flow conflict step state as the manual resolutions
   * have been changed.
   */
  private updateRebaseStateAfterManualResolution(repository: Repository) {
    const currentState = this.repositoryStateCache.get(repository)

    const { changesState, rebaseState } = currentState
    const { conflictState } = changesState
    const { step } = rebaseState

    if (
      conflictState !== null &&
      conflictState.kind === 'rebase' &&
      step !== null &&
      step.kind === RebaseStep.ShowConflicts
    ) {
      this.repositoryStateCache.updateRebaseState(repository, () => ({
        step: { ...step, conflictState },
      }))
    }
  }

  /**
   * Updates the cherry pick flow conflict step state as the manual resolutions
   * have been changed.
   */
  private updateCherryPickStateAfterManualResolution(
    repository: Repository
  ): void {
    const currentState = this.repositoryStateCache.get(repository)

    const { changesState, cherryPickState } = currentState
    const { conflictState } = changesState
    const { step } = cherryPickState

    if (
      conflictState === null ||
      step === null ||
      !isCherryPickConflictState(conflictState) ||
      step.kind !== CherryPickStepKind.ShowConflicts
    ) {
      return
    }

    this.repositoryStateCache.updateCherryPickState(repository, () => ({
      step: { ...step, conflictState },
    }))
  }

  private async createStashAndDropPreviousEntry(
    repository: Repository,
    branch: Branch
  ) {
    const entry = await getLastDesktopStashEntryForBranch(repository, branch)
    const gitStore = this.gitStoreCache.get(repository)

    const createdStash = await gitStore.performFailableOperation(() =>
      this.createStashEntry(repository, branch)
    )

    if (createdStash === true && entry !== null) {
      const { stashSha, branchName } = entry
      await gitStore.performFailableOperation(async () => {
        await dropDesktopStashEntry(repository, stashSha)
        log.info(`Dropped stash '${stashSha}' associated with ${branchName}`)
      })
    }

    return createdStash === true
  }

  private async createStashEntry(repository: Repository, branch: Branch) {
    const { changesState } = this.repositoryStateCache.get(repository)
    const { workingDirectory } = changesState
    const untrackedFiles = getUntrackedFiles(workingDirectory)

    return await createDesktopStashEntry(repository, branch, untrackedFiles)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _popStashEntry(repository: Repository, stashEntry: IStashEntry) {
    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.performFailableOperation(() => {
      return popStashEntry(repository, stashEntry.stashSha)
    })
    log.info(
      `[AppStore. _popStashEntry] popped stash with commit id ${stashEntry.stashSha}`
    )

    this.statsStore.recordStashRestore()
    await this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _dropStashEntry(
    repository: Repository,
    stashEntry: IStashEntry
  ) {
    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.performFailableOperation(() => {
      return dropDesktopStashEntry(repository, stashEntry.stashSha)
    })
    log.info(
      `[AppStore. _dropStashEntry] dropped stash with commit id ${stashEntry.stashSha}`
    )

    this.statsStore.recordStashDiscard()
    await gitStore.loadStashEntries()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _setStashedFilesWidth(width: number): Promise<void> {
    this.stashedFilesWidth = width
    setNumber(stashedFilesWidthConfigKey, width)
    this.emitUpdate()

    return Promise.resolve()
  }

  public _resetStashedFilesWidth(): Promise<void> {
    this.stashedFilesWidth = defaultStashedFilesWidth
    localStorage.removeItem(stashedFilesWidthConfigKey)
    this.emitUpdate()

    return Promise.resolve()
  }

  public async _testPruneBranches() {
    if (this.currentBranchPruner === null) {
      return
    }

    await this.currentBranchPruner.testPrune()
  }

  public async _showCreateForkDialog(
    repository: RepositoryWithGitHubRepository
  ) {
    const account = getAccountForRepository(this.accounts, repository)
    if (account === null) {
      return
    }
    await this._showPopup({
      type: PopupType.CreateFork,
      repository,
      account,
    })
  }

  /**
   * Converts a local repository to use the given fork
   * as its default remote and associated `GitHubRepository`.
   */
  public async _convertRepositoryToFork(
    repository: RepositoryWithGitHubRepository,
    fork: IAPIFullRepository
  ): Promise<Repository> {
    const gitStore = this.gitStoreCache.get(repository)
    const defaultRemoteName = gitStore.defaultRemote?.name
    const remoteUrl = gitStore.defaultRemote?.url
    const { endpoint } = repository.gitHubRepository

    // make sure there is a default remote (there should be)
    if (defaultRemoteName !== undefined && remoteUrl !== undefined) {
      // update default remote
      if (await gitStore.setRemoteURL(defaultRemoteName, fork.clone_url)) {
        await gitStore.ensureUpstreamRemoteURL(remoteUrl)
        // update associated github repo
        return this.repositoriesStore.setGitHubRepository(
          repository,
          await this.repositoriesStore.upsertGitHubRepository(endpoint, fork)
        )
      }
    }
    return repository
  }

  /**
   * Create a tutorial repository using the given account. The account
   * determines which host (i.e. GitHub.com or a GHES instance) that
   * the tutorial repository should be created on.
   *
   * @param account The account (and thereby the GitHub host) under
   *                which the repository is to be created created
   */
  public async _createTutorialRepository(account: Account) {
    try {
      await this.statsStore.recordTutorialStarted()

      const name = 'desktop-tutorial'
      const path = Path.resolve(getDefaultDir(), name)

      const apiRepository = await createTutorialRepository(
        account,
        name,
        path,
        (title, value, description) => {
          if (
            this.currentPopup !== null &&
            this.currentPopup.type === PopupType.CreateTutorialRepository
          ) {
            this.currentPopup = {
              ...this.currentPopup,
              progress: { kind: 'generic', title, value, description },
            }
            this.emitUpdate()
          }
        }
      )

      await this._addTutorialRepository(path, account.endpoint, apiRepository)
      await this.statsStore.recordTutorialRepoCreated()
    } catch (err) {
      sendNonFatalException('tutorialRepoCreation', err)

      if (err instanceof GitError) {
        this.emitError(err)
      } else {
        this.emitError(
          new Error(
            `Failed creating the tutorial repository.\n\n${err.message}`
          )
        )
      }
    } finally {
      this._closePopup(PopupType.CreateTutorialRepository)
    }
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _setCherryPickFlowStep(
    repository: Repository,
    step: CherryPickFlowStep
  ): Promise<void> {
    this.repositoryStateCache.updateCherryPickState(repository, () => ({
      step,
    }))

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _initializeCherryPickProgress(
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ) {
    if (commits.length === 0) {
      // This shouldn't happen... but in case throw error.
      throw new Error(
        'Unable to initialize cherry-pick progress. No commits provided.'
      )
    }

    this.repositoryStateCache.updateCherryPickState(repository, () => {
      return {
        progress: {
          kind: 'cherryPick',
          title: `Cherry-picking commit 1 of ${commits.length} commits`,
          value: 0,
          position: 1,
          totalCommitCount: commits.length,
          currentCommitSummary: commits[commits.length - 1].summary,
        },
      }
    })

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _cherryPick(
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ): Promise<CherryPickResult> {
    if (commits.length === 0) {
      log.error('[_cherryPick] - Unable to cherry-pick. No commits provided.')
      return CherryPickResult.UnableToStart
    }

    await this._refreshRepository(repository)

    const progressCallback = (progress: ICherryPickProgress) => {
      this.repositoryStateCache.updateCherryPickState(repository, () => ({
        progress,
      }))
      this.emitUpdate()
    }

    const gitStore = this.gitStoreCache.get(repository)
    const result = await gitStore.performFailableOperation(() =>
      cherryPick(repository, commits, progressCallback)
    )

    return result || CherryPickResult.Error
  }

  /**
   * Checks for uncommitted changes
   *
   * If uncommitted changes exist, ask user to stash, retry provided retry
   * action and return true.
   *
   * If no uncommitted changes, return false.
   *
   * This shouldn't be called directly. See `Dispatcher`.
   */
  public _checkForUncommittedChanges(
    repository: Repository,
    retryAction: RetryAction
  ): boolean {
    const { changesState } = this.repositoryStateCache.get(repository)
    const hasChanges = changesState.workingDirectory.files.length > 0
    if (!hasChanges) {
      return false
    }

    this._showPopup({
      type: PopupType.LocalChangesOverwritten,
      repository,
      retryAction,
      files: changesState.workingDirectory.files.map(f => f.path),
    })

    return true
  }

  /**
   * Attempts to checkout target branch and return it's name after checkout.
   * This is useful if you want the local name when checking out a potentially
   * remote branch during an operation.
   *
   * Note: This does not do any existing changes checking like _checkout does.
   *
   * This shouldn't be called directly. See `Dispatcher`.
   */
  public async _checkoutBranchReturnName(
    repository: Repository,
    targetBranch: Branch
  ): Promise<string | undefined> {
    const gitStore = this.gitStoreCache.get(repository)

    const checkoutSuccessful = await this.withAuthenticatingUser(
      repository,
      (r, account) => {
        return gitStore.performFailableOperation(() =>
          checkoutBranch(repository, account, targetBranch)
        )
      }
    )

    if (checkoutSuccessful !== true) {
      return
    }

    const status = await gitStore.loadStatus()
    return status?.currentBranch
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _abortCherryPick(
    repository: Repository,
    sourceBranch: Branch | null
  ): Promise<void> {
    const gitStore = this.gitStoreCache.get(repository)

    await gitStore.performFailableOperation(() => abortCherryPick(repository))

    await this.checkoutBranchIfNotNull(repository, sourceBranch)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _endCherryPickFlow(repository: Repository): void {
    this.repositoryStateCache.updateCherryPickState(repository, () => ({
      step: null,
      progress: null,
      userHasResolvedConflicts: false,
    }))

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _setCherryPickTargetBranchUndoSha(
    repository: Repository,
    sha: string
  ): void {
    // An update is not emitted here because there is no need
    // to trigger a re-render at this point. (storing for later)
    this.repositoryStateCache.updateCherryPickState(repository, () => ({
      targetBranchUndoSha: sha,
    }))
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _setCherryPickBranchCreated(
    repository: Repository,
    branchCreated: boolean
  ): void {
    // An update is not emitted here because there is no need
    // to trigger a re-render at this point. (storing for later)
    this.repositoryStateCache.updateCherryPickState(repository, () => ({
      branchCreated,
    }))
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _setCherryPickConflictsResolved(repository: Repository) {
    // an update is not emitted here because there is no need
    // to trigger a re-render at this point

    this.repositoryStateCache.updateCherryPickState(repository, () => ({
      userHasResolvedConflicts: true,
    }))
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _continueCherryPick(
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>,
    manualResolutions: ReadonlyMap<string, ManualConflictResolution>
  ): Promise<CherryPickResult> {
    const progressCallback = (progress: ICherryPickProgress) => {
      this.repositoryStateCache.updateCherryPickState(repository, () => ({
        progress,
      }))
      this.emitUpdate()
    }

    const gitStore = this.gitStoreCache.get(repository)
    const result = await gitStore.performFailableOperation(() =>
      continueCherryPick(repository, files, manualResolutions, progressCallback)
    )

    return result || CherryPickResult.Error
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _setCherryPickProgressFromState(repository: Repository) {
    const snapshot = await getCherryPickSnapshot(repository)
    if (snapshot === null) {
      return
    }

    const { progress, targetBranchUndoSha } = snapshot

    this.repositoryStateCache.updateCherryPickState(repository, () => ({
      progress,
      targetBranchUndoSha,
    }))
  }

  /** display the cherry pick flow, if not already in this flow */
  private async showCherryPickConflictsDialog(
    repository: Repository,
    conflictState: CherryPickConflictState
  ) {
    const alreadyInFlow =
      this.currentPopup !== null &&
      this.currentPopup.type === PopupType.CherryPick

    if (alreadyInFlow) {
      return
    }

    const displayingBanner =
      this.currentBanner !== null &&
      this.currentBanner.type === BannerType.CherryPickConflictsFound

    if (displayingBanner) {
      return
    }

    await this._setCherryPickProgressFromState(repository)

    this._setCherryPickFlowStep(repository, {
      kind: CherryPickStepKind.ShowConflicts,
      conflictState,
    })

    const snapshot = await getCherryPickSnapshot(repository)

    if (snapshot === null) {
      log.error(
        `[showCherryPickConflictsDialog] unable to get cherry-pick status from git, unable to continue`
      )
      return
    }

    this._showPopup({
      type: PopupType.CherryPick,
      repository,
      commits: snapshot.commits,
      sourceBranch: null,
    })
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public _dismissCherryPickIntro() {
    setBoolean(hasShownCherryPickIntroKey, true)
    this.hasShownCherryPickIntro = true
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _clearCherryPickingHead(
    repository: Repository,
    sourceBranch: Branch | null
  ): Promise<void> {
    if (!isCherryPickHeadFound(repository)) {
      return
    }

    const gitStore = this.gitStoreCache.get(repository)
    await gitStore.performFailableOperation(() => abortCherryPick(repository))

    await this.checkoutBranchIfNotNull(repository, sourceBranch)

    return this._refreshRepository(repository)
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _undoCherryPick(
    repository: Repository,
    targetBranchName: string,
    sourceBranch: Branch | null,
    countCherryPicked: number
  ): Promise<boolean> {
    const { branchesState } = this.repositoryStateCache.get(repository)
    const { tip } = branchesState
    if (tip.kind !== TipState.Valid || tip.branch.name !== targetBranchName) {
      log.error(
        '[undoCherryPick] - Could not undo cherry-pick.  User no longer on target branch.'
      )
      return false
    }

    const {
      cherryPickState: { targetBranchUndoSha, branchCreated },
    } = this.repositoryStateCache.get(repository)

    // If a new branch is created as part of the cherry-pick,
    // We just want to delete it, no need to reset it.
    if (branchCreated) {
      this._deleteBranch(repository, tip.branch, false, sourceBranch)
      return true
    }

    if (targetBranchUndoSha === null) {
      log.error('[undoCherryPick] - Could not determine target branch undo sha')
      return false
    }

    const gitStore = this.gitStoreCache.get(repository)
    const result = await gitStore.performFailableOperation(() =>
      reset(repository, GitResetMode.Hard, targetBranchUndoSha)
    )

    if (result !== true) {
      return false
    }

    await this.checkoutBranchIfNotNull(repository, sourceBranch)

    const banner: Banner = {
      type: BannerType.CherryPickUndone,
      targetBranchName,
      countCherryPicked,
    }
    this._setBanner(banner)

    await this._refreshRepository(repository)

    return true
  }

  private async checkoutBranchIfNotNull(
    repository: Repository,
    sourceBranch: Branch | null
  ) {
    if (sourceBranch === null) {
      return
    }

    const gitStore = this.gitStoreCache.get(repository)
    await this.withAuthenticatingUser(repository, async (r, account) => {
      await gitStore.performFailableOperation(() =>
        checkoutBranch(repository, account, sourceBranch)
      )
    })
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _setDragElement(dragElement: DragElement | null): Promise<void> {
    this.currentDragElement = dragElement
    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _getBranchAheadBehind(
    repository: Repository,
    branch: Branch
  ): Promise<IAheadBehind | null> {
    return getBranchAheadBehind(repository, branch)
  }

  public _setLastThankYou(lastThankYou: ILastThankYou) {
    // don't update if same length and same version (assumption
    // is that update will be either adding a user or updating version)
    const sameVersion =
      this.lastThankYou !== undefined &&
      this.lastThankYou.version === lastThankYou.version

    const sameNumCheckedUsers =
      this.lastThankYou !== undefined &&
      this.lastThankYou.checkedUsers.length === lastThankYou.checkedUsers.length

    if (sameVersion && sameNumCheckedUsers) {
      return
    }

    setObject(lastThankYouKey, lastThankYou)
    this.lastThankYou = lastThankYou

    this.emitUpdate()
  }

  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _squash(
    repository: Repository,
    toSquash: ReadonlyArray<CommitOneLine>,
    squashOnto: CommitOneLine,
    lastRetainedCommitRef: string,
    commitContext: ICommitContext
  ): Promise<RebaseResult> {
    if (toSquash.length === 0) {
      log.error('[_squash] - Unable to squash. No commits provided.')
      return RebaseResult.Error
    }

    // TODO: Add progress callback

    const commitMessage = await formatCommitMessage(repository, commitContext)
    const gitStore = this.gitStoreCache.get(repository)
    const result = await gitStore.performFailableOperation(() =>
      squash(
        repository,
        toSquash,
        squashOnto,
        lastRetainedCommitRef,
        commitMessage
      )
    )

    return result || RebaseResult.Error
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
 * Check if the user is in a rebase flow step that doesn't depend on conflicted
 * state, as the app should not attempt to clean up any popups or banners while
 * this is occurring.
 */
function userIsStartingRebaseFlow(
  currentPopup: Popup | null,
  state: IRebaseState
) {
  if (currentPopup === null) {
    return false
  }

  if (currentPopup.type !== PopupType.RebaseFlow) {
    return false
  }

  if (state.step === null) {
    return false
  }

  if (
    state.step.kind === RebaseStep.ChooseBranch ||
    state.step.kind === RebaseStep.WarnForcePush ||
    state.step.kind === RebaseStep.ShowProgress
  ) {
    return true
  }

  return false
}

function isLocalChangesOverwrittenError(error: Error): boolean {
  if (error instanceof ErrorWithMetadata) {
    return isLocalChangesOverwrittenError(error.underlyingError)
  }

  return (
    error instanceof GitError &&
    error.result.gitError === DugiteError.LocalChangesOverwritten
  )
}
