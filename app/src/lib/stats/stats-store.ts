import { StatsDatabase, ILaunchStats, IDailyMeasures } from './stats-database'
import { getDotComAPIEndpoint } from '../api'
import { getVersion } from '../../ui/lib/app-proxy'
import { hasShownWelcomeFlow } from '../welcome'
import { Account } from '../../models/account'
import { getOS } from '../get-os'
import { Repository } from '../../models/repository'
import { merge } from '../../lib/merge'
import { getPersistedThemeName } from '../../ui/lib/application-theme'
import { IUiActivityMonitor } from '../../ui/lib/ui-activity-monitor'
import { Disposable } from 'event-kit'
import {
  SignInMethod,
  showDiffCheckMarksDefault,
  showDiffCheckMarksKey,
  underlineLinksDefault,
  underlineLinksKey,
  useCustomEditorKey,
  useCustomShellKey,
} from '../stores'
import { assertNever } from '../fatal-error'
import {
  getNumber,
  setNumber,
  getBoolean,
  setBoolean,
  getNumberArray,
  setNumberArray,
} from '../local-storage'
import { PushOptions } from '../git'
import { getShowSideBySideDiff } from '../../ui/lib/diff-mode'
import { getAppArchitecture } from '../../ui/main-process-proxy'
import { Architecture } from '../get-architecture'
import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { getNotificationsEnabled } from '../stores/notifications-store'
import { isInApplicationFolder } from '../../ui/main-process-proxy'
import { getRendererGUID } from '../get-renderer-guid'
import { ValidNotificationPullRequestReviewState } from '../valid-notification-pull-request-review'
import { useExternalCredentialHelperKey } from '../trampoline/use-external-credential-helper'
import { enableExternalCredentialHelper } from '../feature-flag'

type PullRequestReviewStatFieldInfix =
  | 'Approved'
  | 'ChangesRequested'
  | 'Commented'

type PullRequestReviewStatFieldSuffix =
  | 'NotificationCount'
  | 'NotificationClicked'
  | 'DialogSwitchToPullRequestCount'

type PullRequestReviewStatField =
  `pullRequestReview${PullRequestReviewStatFieldInfix}${PullRequestReviewStatFieldSuffix}`

const StatsEndpoint = 'https://central.github.com/api/usage/desktop'

/** The URL to the stats samples page. */
export const SamplesURL = 'https://desktop.github.com/usage-data/'

const LastDailyStatsReportKey = 'last-daily-stats-report'

/** The localStorage key for whether the user has opted out. */
const StatsOptOutKey = 'stats-opt-out'

/** Have we successfully sent the stats opt-in? */
const HasSentOptInPingKey = 'has-sent-stats-opt-in-ping'

const WelcomeWizardInitiatedAtKey = 'welcome-wizard-initiated-at'
const WelcomeWizardCompletedAtKey = 'welcome-wizard-terminated-at'
const FirstRepositoryAddedAtKey = 'first-repository-added-at'
const FirstRepositoryClonedAtKey = 'first-repository-cloned-at'
const FirstRepositoryCreatedAtKey = 'first-repository-created-at'
const FirstCommitCreatedAtKey = 'first-commit-created-at'
const FirstPushToGitHubAtKey = 'first-push-to-github-at'
const FirstNonDefaultBranchCheckoutAtKey =
  'first-non-default-branch-checkout-at'
const WelcomeWizardSignInMethodKey = 'welcome-wizard-sign-in-method'
const terminalEmulatorKey = 'shell'
const textEditorKey: string = 'externalEditor'

const RepositoriesCommittedInWithoutWriteAccessKey =
  'repositories-committed-in-without-write-access'

/** How often daily stats should be submitted (i.e., 24 hours). */
const DailyStatsReportInterval = 1000 * 60 * 60 * 24

const DefaultDailyMeasures: IDailyMeasures = {
  commits: 0,
  partialCommits: 0,
  openShellCount: 0,
  coAuthoredCommits: 0,
  commitsUndoneWithChanges: 0,
  commitsUndoneWithoutChanges: 0,
  branchComparisons: 0,
  defaultBranchComparisons: 0,
  mergesInitiatedFromComparison: 0,
  updateFromDefaultBranchMenuCount: 0,
  mergeIntoCurrentBranchMenuCount: 0,
  prBranchCheckouts: 0,
  repoWithIndicatorClicked: 0,
  repoWithoutIndicatorClicked: 0,
  dotcomPushCount: 0,
  dotcomForcePushCount: 0,
  enterprisePushCount: 0,
  enterpriseForcePushCount: 0,
  externalPushCount: 0,
  externalForcePushCount: 0,
  active: false,
  mergeConflictFromPullCount: 0,
  mergeConflictFromExplicitMergeCount: 0,
  mergedWithLoadingHintCount: 0,
  mergedWithCleanMergeHintCount: 0,
  mergedWithConflictWarningHintCount: 0,
  mergeSuccessAfterConflictsCount: 0,
  mergeAbortedAfterConflictsCount: 0,
  unattributedCommits: 0,
  enterpriseCommits: 0,
  dotcomCommits: 0,
  mergeConflictsDialogDismissalCount: 0,
  anyConflictsLeftOnMergeConflictsDialogDismissalCount: 0,
  mergeConflictsDialogReopenedCount: 0,
  guidedConflictedMergeCompletionCount: 0,
  unguidedConflictedMergeCompletionCount: 0,
  createPullRequestCount: 0,
  createPullRequestFromPreviewCount: 0,
  rebaseConflictsDialogDismissalCount: 0,
  rebaseConflictsDialogReopenedCount: 0,
  rebaseAbortedAfterConflictsCount: 0,
  rebaseSuccessAfterConflictsCount: 0,
  rebaseSuccessWithoutConflictsCount: 0,
  rebaseWithBranchAlreadyUpToDateCount: 0,
  pullWithRebaseCount: 0,
  pullWithDefaultSettingCount: 0,
  stashEntriesCreatedOutsideDesktop: 0,
  errorWhenSwitchingBranchesWithUncommmittedChanges: 0,
  rebaseCurrentBranchMenuCount: 0,
  stashViewedAfterCheckoutCount: 0,
  stashCreatedOnCurrentBranchCount: 0,
  stashNotViewedAfterCheckoutCount: 0,
  changesTakenToNewBranchCount: 0,
  stashRestoreCount: 0,
  stashDiscardCount: 0,
  stashViewCount: 0,
  noActionTakenOnStashCount: 0,
  suggestedStepOpenInExternalEditor: 0,
  suggestedStepOpenWorkingDirectory: 0,
  suggestedStepViewOnGitHub: 0,
  suggestedStepPublishRepository: 0,
  suggestedStepPublishBranch: 0,
  suggestedStepCreatePullRequest: 0,
  suggestedStepViewStash: 0,
  commitsToProtectedBranch: 0,
  commitsToRepositoryWithBranchProtections: 0,
  tutorialStarted: false,
  tutorialRepoCreated: false,
  tutorialEditorInstalled: false,
  tutorialBranchCreated: false,
  tutorialFileEdited: false,
  tutorialCommitCreated: false,
  tutorialBranchPushed: false,
  tutorialPrCreated: false,
  tutorialCompleted: false,
  // this is `-1` because `0` signifies "tutorial created"
  highestTutorialStepCompleted: -1,
  commitsToRepositoryWithoutWriteAccess: 0,
  forksCreated: 0,
  issueCreationWebpageOpenedCount: 0,
  tagsCreatedInDesktop: 0,
  tagsCreated: 0,
  tagsDeleted: 0,
  diffModeChangeCount: 0,
  diffOptionsViewedCount: 0,
  repositoryViewChangeCount: 0,
  unhandledRejectionCount: 0,
  cherryPickSuccessfulCount: 0,
  cherryPickViaDragAndDropCount: 0,
  cherryPickViaContextMenuCount: 0,
  dragStartedAndCanceledCount: 0,
  cherryPickConflictsEncounteredCount: 0,
  cherryPickSuccessfulWithConflictsCount: 0,
  cherryPickMultipleCommitsCount: 0,
  cherryPickUndoneCount: 0,
  cherryPickBranchCreatedCount: 0,
  amendCommitStartedCount: 0,
  amendCommitSuccessfulWithFileChangesCount: 0,
  amendCommitSuccessfulWithoutFileChangesCount: 0,
  reorderSuccessfulCount: 0,
  reorderStartedCount: 0,
  reorderConflictsEncounteredCount: 0,
  reorderSuccessfulWithConflictsCount: 0,
  reorderMultipleCommitsCount: 0,
  reorderUndoneCount: 0,
  squashConflictsEncounteredCount: 0,
  squashMultipleCommitsInvokedCount: 0,
  squashSuccessfulCount: 0,
  squashSuccessfulWithConflictsCount: 0,
  squashViaContextMenuInvokedCount: 0,
  squashViaDragAndDropInvokedCount: 0,
  squashUndoneCount: 0,
  squashMergeIntoCurrentBranchMenuCount: 0,
  squashMergeSuccessfulWithConflictsCount: 0,
  squashMergeSuccessfulCount: 0,
  squashMergeInvokedCount: 0,
  resetToCommitCount: 0,
  opensCheckRunsPopover: 0,
  viewsCheckOnline: 0,
  viewsCheckJobStepOnline: 0,
  rerunsChecks: 0,
  checksFailedNotificationCount: 0,
  checksFailedNotificationFromRecentRepoCount: 0,
  checksFailedNotificationFromNonRecentRepoCount: 0,
  checksFailedNotificationClicked: 0,
  checksFailedDialogOpenCount: 0,
  checksFailedDialogSwitchToPullRequestCount: 0,
  checksFailedDialogRerunChecksCount: 0,
  pullRequestReviewNotificationFromRecentRepoCount: 0,
  pullRequestReviewNotificationFromNonRecentRepoCount: 0,
  pullRequestReviewApprovedNotificationCount: 0,
  pullRequestReviewApprovedNotificationClicked: 0,
  pullRequestReviewApprovedDialogSwitchToPullRequestCount: 0,
  pullRequestReviewCommentedNotificationCount: 0,
  pullRequestReviewCommentedNotificationClicked: 0,
  pullRequestReviewCommentedDialogSwitchToPullRequestCount: 0,
  pullRequestReviewChangesRequestedNotificationCount: 0,
  pullRequestReviewChangesRequestedNotificationClicked: 0,
  pullRequestReviewChangesRequestedDialogSwitchToPullRequestCount: 0,
  pullRequestCommentNotificationCount: 0,
  pullRequestCommentNotificationClicked: 0,
  pullRequestCommentNotificationFromRecentRepoCount: 0,
  pullRequestCommentNotificationFromNonRecentRepoCount: 0,
  pullRequestCommentDialogSwitchToPullRequestCount: 0,
  multiCommitDiffWithUnreachableCommitWarningCount: 0,
  multiCommitDiffFromHistoryCount: 0,
  multiCommitDiffFromCompareCount: 0,
  multiCommitDiffUnreachableCommitsDialogOpenedCount: 0,
  submoduleDiffViewedFromChangesListCount: 0,
  submoduleDiffViewedFromHistoryCount: 0,
  openSubmoduleFromDiffCount: 0,
  previewedPullRequestCount: 0,
}

// A subtype of IDailyMeasures filtered to contain only its numeric properties
type NumericMeasures = {
  [P in keyof IDailyMeasures as IDailyMeasures[P] extends number
    ? P
    : never]: IDailyMeasures[P]
}

interface IOnboardingStats {
  /**
   * Time (in seconds) from when the user first launched the application and
   * entered the welcome wizard until the user added their first existing
   * repository.
   *
   * A negative value means that this action hasn't yet taken place while
   * undefined means that the current user installed desktop prior to this
   * metric being added and we will thus never be able to provide a value.
   */
  readonly timeToFirstAddedRepository?: number

  /**
   * Time (in seconds) from when the user first launched the application and
   * entered the welcome wizard until the user cloned their first repository.
   *
   * A negative value means that this action hasn't yet taken place while
   * undefined means that the current user installed desktop prior to this
   * metric being added and we will thus never be able to provide a value.
   */
  readonly timeToFirstClonedRepository?: number

  /**
   * Time (in seconds) from when the user first launched the application and
   * entered the welcome wizard until the user created their first new
   * repository.
   *
   * A negative value means that this action hasn't yet taken place while
   * undefined means that the current user installed desktop prior to this
   * metric being added and we will thus never be able to provide a value.
   */
  readonly timeToFirstCreatedRepository?: number

  /**
   * Time (in seconds) from when the user first launched the application and
   * entered the welcome wizard until the user crafted their first commit.
   *
   * A negative value means that this action hasn't yet taken place while
   * undefined means that the current user installed desktop prior to this
   * metric being added and we will thus never be able to provide a value.
   */
  readonly timeToFirstCommit?: number

  /**
   * Time (in seconds) from when the user first launched the application and
   * entered the welcome wizard until the user performed their first push of a
   * repository to GitHub.com or GitHub Enterprise. This metric does not track
   * pushes to non-GitHub remotes.
   */
  readonly timeToFirstGitHubPush?: number

  /**
   * Time (in seconds) from when the user first launched the application and
   * entered the welcome wizard until the user first checked out a branch in any
   * repository which is not the default branch of that repository.
   *
   * Note that this metric will be set regardless of whether that repository was
   * a GitHub.com/GHE repository, local repository or has a non-GitHub remote.
   *
   * A negative value means that this action hasn't yet taken place while
   * undefined means that the current user installed desktop prior to this
   * metric being added and we will thus never be able to provide a value.
   */
  readonly timeToFirstNonDefaultBranchCheckout?: number

  /**
   * Time (in seconds) from when the user first launched the application and
   * entered the welcome wizard until the user completed the wizard.
   *
   * A negative value means that this action hasn't yet taken place while
   * undefined means that the current user installed desktop prior to this
   * metric being added and we will thus never be able to provide a value.
   */
  readonly timeToWelcomeWizardTerminated?: number

  /**
   * The method that was used when authenticating a user in the welcome flow. If
   * multiple successful authentications happened during the welcome flow due to
   * the user stepping back and signing in to another account this will reflect
   * the last one.
   */
  readonly welcomeWizardSignInMethod?: 'basic' | 'web'
}

interface ICalculatedStats {
  /** The app version. */
  readonly version: string

  /** The OS version. */
  readonly osVersion: string

  /** The platform. */
  readonly platform: string

  /** The architecture. */
  readonly architecture: Architecture

  /** The number of total repositories. */
  readonly repositoryCount: number

  /** The number of GitHub repositories. */
  readonly gitHubRepositoryCount: number

  /** The install ID. */
  readonly guid: string

  /** Is the user logged in with a GitHub.com account? */
  readonly dotComAccount: boolean

  /** Is the user logged in with an Enterprise account? */
  readonly enterpriseAccount: boolean

  /**
   * The name of the currently selected theme/application appearance as set at
   * time of stats submission.
   */
  readonly theme: string

  /** The selected terminal emulator at the time of stats submission */
  readonly selectedTerminalEmulator: string

  /** The selected text editor at the time of stats submission */
  readonly selectedTextEditor: string

  readonly eventType: 'usage'

  /**
   * _[Forks]_ How many repos did the user commit in without having `write`
   * access?
   *
   * This is a hack in that its really a "computed daily measure" and the moment
   * we have another one of those we should consider refactoring them into their
   * own interface
   */
  readonly repositoriesCommittedInWithoutWriteAccess: number

  /**
   * whether not to the user has chosent to view diffs in split, or unified (the
   * default) diff view mode
   */
  readonly diffMode: 'split' | 'unified'

  /**
   * Whether the app was launched from the Applications folder or not. This is
   * only relevant on macOS, null will be sent otherwise.
   */
  readonly launchedFromApplicationsFolder: boolean | null

  /** Whether or not the user has enabled high-signal notifications */
  readonly notificationsEnabled: boolean

  /** Whether or not the user has their accessibility setting set for viewing link underlines */
  readonly linkUnderlinesVisible: boolean

  /** Whether or not the user has their accessibility setting set for viewing diff check marks */
  readonly diffCheckMarksVisible: boolean

  /**
   * Whether or not the user has enabled the external credential helper or null
   * if the user has not yet made an active decision
   **/
  readonly useExternalCredentialHelper?: boolean | null
}

type DailyStats = ICalculatedStats &
  ILaunchStats &
  IDailyMeasures &
  IOnboardingStats

/**
 * Testable interface for StatsStore
 *
 * Note: for the moment this only contains methods that are needed for testing,
 * so fight the urge to implement every public method from StatsStore here
 *
 */
export interface IStatsStore {
  increment: (
    metric:
      | 'mergeAbortedAfterConflictsCount'
      | 'rebaseAbortedAfterConflictsCount'
      | 'mergeSuccessAfterConflictsCount'
      | 'rebaseSuccessAfterConflictsCount'
  ) => void
}

const defaultPostImplementation = (body: Record<string, any>) =>
  fetch(StatsEndpoint, {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })

/** The store for the app's stats. */
export class StatsStore implements IStatsStore {
  private uiActivityMonitorSubscription: Disposable | null = null

  /** Has the user opted out of stats reporting? */
  private optOut: boolean

  public constructor(
    private readonly db: StatsDatabase,
    private readonly uiActivityMonitor: IUiActivityMonitor,
    private readonly post = defaultPostImplementation
  ) {
    const storedValue = getHasOptedOutOfStats()

    this.optOut = storedValue || false

    // If the user has set an opt out value but we haven't sent the ping yet,
    // give it a shot now.
    if (!getBoolean(HasSentOptInPingKey, false)) {
      this.sendOptInStatusPing(this.optOut, storedValue)
    }

    this.enableUiActivityMonitoring()

    window.addEventListener('unhandledrejection', async () => {
      try {
        this.increment('unhandledRejectionCount')
      } catch (err) {
        log.error(`Failed recording unhandled rejection`, err)
      }
    })
  }

  /** Should the app report its daily stats? */
  private shouldReportDailyStats(): boolean {
    const lastDate = getNumber(LastDailyStatsReportKey, 0)
    const now = Date.now()
    return now - lastDate > DailyStatsReportInterval
  }

  /** Report any stats which are eligible for reporting. */
  public async reportStats(
    accounts: ReadonlyArray<Account>,
    repositories: ReadonlyArray<Repository>
  ) {
    if (this.optOut) {
      return
    }

    // Never report stats while in dev or test. They could be pretty crazy.
    if (__DEV__ || process.env.TEST_ENV) {
      return
    }

    // don't report until the user has had a chance to view and opt-in for
    // sharing their stats with us
    if (!hasShownWelcomeFlow()) {
      return
    }

    if (!this.shouldReportDailyStats()) {
      return
    }

    const now = Date.now()
    const payload = await this.getDailyStats(accounts, repositories)

    try {
      const response = await this.post(payload)
      if (!response.ok) {
        throw new Error(
          `Unexpected status: ${response.statusText} (${response.status})`
        )
      }

      log.info('Stats reported.')

      await this.clearDailyStats()
      setNumber(LastDailyStatsReportKey, now)
    } catch (e) {
      log.error('Error reporting stats:', e)
    }
  }

  /** Record the given launch stats. */
  public async recordLaunchStats(stats: ILaunchStats) {
    await this.db.launches.add(stats)
  }

  /**
   * Clear the stored daily stats. Not meant to be called directly. Marked as
   * public in order to enable testing of a specific scenario, see
   * stats-store-tests for more detail.
   */
  public async clearDailyStats() {
    await this.db.launches.clear()
    await this.db.dailyMeasures.clear()

    // This is a one-off, and the moment we have another computed daily measure
    // we should consider refactoring them into their own interface
    localStorage.removeItem(RepositoriesCommittedInWithoutWriteAccessKey)

    this.enableUiActivityMonitoring()
  }

  private enableUiActivityMonitoring() {
    if (this.uiActivityMonitorSubscription !== null) {
      return
    }

    this.uiActivityMonitorSubscription = this.uiActivityMonitor.onActivity(
      this.onUiActivity
    )
  }

  private disableUiActivityMonitoring() {
    if (this.uiActivityMonitorSubscription === null) {
      return
    }

    this.uiActivityMonitorSubscription.dispose()
    this.uiActivityMonitorSubscription = null
  }

  /** Get the daily stats. */
  private async getDailyStats(
    accounts: ReadonlyArray<Account>,
    repositories: ReadonlyArray<Repository>
  ): Promise<DailyStats> {
    const launchStats = await this.getAverageLaunchStats()
    const dailyMeasures = await this.getDailyMeasures()
    const userType = this.determineUserType(accounts)
    const repositoryCounts = this.categorizedRepositoryCounts(repositories)
    const onboardingStats = this.getOnboardingStats()
    const useCustomShell = getBoolean(useCustomShellKey, false)
    const selectedTerminalEmulator = useCustomShell
      ? 'custom'
      : localStorage.getItem(terminalEmulatorKey) || 'none'
    const useCustomEditor = getBoolean(useCustomEditorKey, false)
    const selectedTextEditor = useCustomEditor
      ? 'custom'
      : localStorage.getItem(textEditorKey) || 'none'
    const repositoriesCommittedInWithoutWriteAccess = getNumberArray(
      RepositoriesCommittedInWithoutWriteAccessKey
    ).length
    const diffMode = getShowSideBySideDiff() ? 'split' : 'unified'
    const linkUnderlinesVisible = getBoolean(
      underlineLinksKey,
      underlineLinksDefault
    )
    const diffCheckMarksVisible = getBoolean(
      showDiffCheckMarksKey,
      showDiffCheckMarksDefault
    )

    // isInApplicationsFolder is undefined when not running on Darwin
    const launchedFromApplicationsFolder = __DARWIN__
      ? await isInApplicationFolder()
      : null

    return {
      eventType: 'usage',
      version: getVersion(),
      osVersion: getOS(),
      platform: process.platform,
      architecture: await getAppArchitecture(),
      theme: getPersistedThemeName(),
      selectedTerminalEmulator,
      selectedTextEditor,
      notificationsEnabled: getNotificationsEnabled(),
      ...launchStats,
      ...dailyMeasures,
      ...userType,
      ...onboardingStats,
      guid: await getRendererGUID(),
      ...repositoryCounts,
      repositoriesCommittedInWithoutWriteAccess,
      diffMode,
      launchedFromApplicationsFolder,
      linkUnderlinesVisible,
      diffCheckMarksVisible,
      ...(enableExternalCredentialHelper()
        ? {
            useExternalCredentialHelper:
              getBoolean(useExternalCredentialHelperKey) ?? null,
          }
        : {}),
    }
  }

  private getOnboardingStats(): IOnboardingStats {
    const wizardInitiatedAt = getLocalStorageTimestamp(
      WelcomeWizardInitiatedAtKey
    )

    // If we don't have a start time for the wizard none of our other metrics
    // makes sense. This will happen for users who installed the app before we
    // started tracking onboarding stats.
    if (wizardInitiatedAt === null) {
      return {}
    }

    const timeToWelcomeWizardTerminated = timeTo(WelcomeWizardCompletedAtKey)
    const timeToFirstAddedRepository = timeTo(FirstRepositoryAddedAtKey)
    const timeToFirstClonedRepository = timeTo(FirstRepositoryClonedAtKey)
    const timeToFirstCreatedRepository = timeTo(FirstRepositoryCreatedAtKey)
    const timeToFirstCommit = timeTo(FirstCommitCreatedAtKey)
    const timeToFirstGitHubPush = timeTo(FirstPushToGitHubAtKey)
    const timeToFirstNonDefaultBranchCheckout = timeTo(
      FirstNonDefaultBranchCheckoutAtKey
    )

    const welcomeWizardSignInMethod = getWelcomeWizardSignInMethod()

    return {
      timeToWelcomeWizardTerminated,
      timeToFirstAddedRepository,
      timeToFirstClonedRepository,
      timeToFirstCreatedRepository,
      timeToFirstCommit,
      timeToFirstGitHubPush,
      timeToFirstNonDefaultBranchCheckout,
      welcomeWizardSignInMethod,
    }
  }

  private categorizedRepositoryCounts(repositories: ReadonlyArray<Repository>) {
    return {
      repositoryCount: repositories.length,
      gitHubRepositoryCount: repositories.filter(r => r.gitHubRepository)
        .length,
    }
  }

  /** Determines if an account is a dotCom and/or enterprise user */
  private determineUserType(accounts: ReadonlyArray<Account>) {
    const dotComAccount = !!accounts.find(
      a => a.endpoint === getDotComAPIEndpoint()
    )
    const enterpriseAccount = !!accounts.find(
      a => a.endpoint !== getDotComAPIEndpoint()
    )

    return {
      dotComAccount,
      enterpriseAccount,
    }
  }

  /** Calculate the average launch stats. */
  private async getAverageLaunchStats(): Promise<ILaunchStats> {
    const launches: ReadonlyArray<ILaunchStats> | undefined =
      await this.db.launches.toArray()
    if (!launches || !launches.length) {
      return {
        mainReadyTime: -1,
        loadTime: -1,
        rendererReadyTime: -1,
      }
    }

    const start: ILaunchStats = {
      mainReadyTime: 0,
      loadTime: 0,
      rendererReadyTime: 0,
    }

    const totals = launches.reduce((running, current) => {
      return {
        mainReadyTime: running.mainReadyTime + current.mainReadyTime,
        loadTime: running.loadTime + current.loadTime,
        rendererReadyTime:
          running.rendererReadyTime + current.rendererReadyTime,
      }
    }, start)

    return {
      mainReadyTime: totals.mainReadyTime / launches.length,
      loadTime: totals.loadTime / launches.length,
      rendererReadyTime: totals.rendererReadyTime / launches.length,
    }
  }

  /** Get the daily measures. */
  private async getDailyMeasures(): Promise<IDailyMeasures> {
    const measures: IDailyMeasures | undefined = await this.db.dailyMeasures
      .limit(1)
      .first()
    return {
      ...DefaultDailyMeasures,
      ...measures,
      // We could spread the database ID in, but we really don't want it.
      id: undefined,
    }
  }

  private async updateDailyMeasures<K extends keyof IDailyMeasures>(
    fn: (measures: IDailyMeasures) => Pick<IDailyMeasures, K>
  ): Promise<void> {
    const defaultMeasures = DefaultDailyMeasures
    await this.db.transaction('rw', this.db.dailyMeasures, async () => {
      const measures = await this.db.dailyMeasures.limit(1).first()
      const measuresWithDefaults = {
        ...defaultMeasures,
        ...measures,
      }
      const newMeasures = merge(measuresWithDefaults, fn(measuresWithDefaults))

      return this.db.dailyMeasures.put(newMeasures)
    })
  }

  /** Record that a commit was accomplished. */
  public async recordCommit(): Promise<void> {
    await this.increment('commits')
    createLocalStorageTimestamp(FirstCommitCreatedAtKey)
  }

  /**
   * Record that a commit was undone.
   *
   * @param cleanWorkingDirectory Whether the working directory is clean.
   */
  public recordCommitUndone = (cleanWorkingDirectory: boolean) =>
    this.increment(
      cleanWorkingDirectory
        ? 'commitsUndoneWithoutChanges'
        : 'commitsUndoneWithChanges'
    )

  /**
   * Record that the user amended a commit.
   *
   * @param withFileChanges Whether the amendment included file changes or not.
   */
  public recordAmendCommitSuccessful = (withFileChanges: boolean) =>
    this.increment(
      withFileChanges
        ? 'amendCommitSuccessfulWithFileChangesCount'
        : 'amendCommitSuccessfulWithoutFileChangesCount'
    )

  /** Record that a merge has been initiated from the `Branch -> Merge Into
   * Current Branch` menu item */
  public recordMenuInitiatedMerge = (isSquash: boolean = false) =>
    this.increment(
      isSquash
        ? 'squashMergeIntoCurrentBranchMenuCount'
        : 'mergeIntoCurrentBranchMenuCount'
    )

  public recordRepoClicked = (repoHasIndicator: boolean) =>
    this.increment(
      repoHasIndicator
        ? 'repoWithIndicatorClicked'
        : 'repoWithoutIndicatorClicked'
    )

  /** Set whether the user has opted out of stats reporting. */
  public async setOptOut(
    optOut: boolean,
    userViewedPrompt: boolean
  ): Promise<void> {
    const changed = this.optOut !== optOut

    this.optOut = optOut

    const previousValue = getBoolean(StatsOptOutKey)

    setBoolean(StatsOptOutKey, optOut)

    if (changed || userViewedPrompt) {
      await this.sendOptInStatusPing(optOut, previousValue)
    }
  }

  /** Has the user opted out of stats reporting? */
  public getOptOut(): boolean {
    return this.optOut
  }

  public async recordPush(
    githubAccount: Account | null,
    options?: PushOptions
  ) {
    if (githubAccount === null) {
      await this.recordPushToGenericRemote(options)
    } else if (githubAccount.endpoint === getDotComAPIEndpoint()) {
      await this.recordPushToGitHub(options)
    } else {
      await this.recordPushToGitHubEnterprise(options)
    }
  }

  /** Record that the user pushed to GitHub.com */
  private async recordPushToGitHub(options?: PushOptions): Promise<void> {
    await this.increment(
      options && options.forceWithLease
        ? 'dotcomForcePushCount'
        : 'dotcomPushCount'
    )
    createLocalStorageTimestamp(FirstPushToGitHubAtKey)
  }

  /** Record that the user pushed to a GitHub Enterprise instance */
  private async recordPushToGitHubEnterprise(
    options?: PushOptions
  ): Promise<void> {
    await this.increment(
      options && options.forceWithLease
        ? 'enterpriseForcePushCount'
        : 'enterprisePushCount'
    )

    // Note, this is not a typo. We track both GitHub.com and GitHub Enterprise
    // under the same key
    createLocalStorageTimestamp(FirstPushToGitHubAtKey)
  }

  /** Record that the user pushed to a generic remote */
  private recordPushToGenericRemote = (options?: PushOptions) =>
    this.increment(
      options && options.forceWithLease
        ? 'externalForcePushCount'
        : 'externalPushCount'
    )

  public recordWelcomeWizardInitiated() {
    setNumber(WelcomeWizardInitiatedAtKey, Date.now())
    localStorage.removeItem(WelcomeWizardCompletedAtKey)
  }

  public recordWelcomeWizardTerminated() {
    setNumber(WelcomeWizardCompletedAtKey, Date.now())
  }

  public recordAddExistingRepository() {
    createLocalStorageTimestamp(FirstRepositoryAddedAtKey)
  }

  public recordCloneRepository() {
    createLocalStorageTimestamp(FirstRepositoryClonedAtKey)
  }

  public recordCreateRepository() {
    createLocalStorageTimestamp(FirstRepositoryCreatedAtKey)
  }

  public recordNonDefaultBranchCheckout() {
    createLocalStorageTimestamp(FirstNonDefaultBranchCheckoutAtKey)
  }

  public recordWelcomeWizardSignInMethod(method: SignInMethod) {
    localStorage.setItem(WelcomeWizardSignInMethodKey, method)
  }

  /** Record the number of stash entries created outside of Desktop for the day
   * */
  public addStashEntriesCreatedOutsideDesktop = (stashCount: number) =>
    this.increment('stashEntriesCreatedOutsideDesktop', stashCount)

  private onUiActivity = async () => {
    this.disableUiActivityMonitoring()

    return this.updateDailyMeasures(m => ({ active: true }))
  }

  /*
   * Onboarding tutorial metrics
   */

  /**
   * Onboarding tutorial has been started, the user has clicked the button to
   * start the onboarding tutorial.
   */
  public recordTutorialStarted() {
    return this.updateDailyMeasures(() => ({ tutorialStarted: true }))
  }

  /** Onboarding tutorial has been successfully created */
  public recordTutorialRepoCreated() {
    return this.updateDailyMeasures(() => ({ tutorialRepoCreated: true }))
  }

  public recordTutorialEditorInstalled() {
    return this.updateDailyMeasures(() => ({ tutorialEditorInstalled: true }))
  }

  public recordTutorialBranchCreated() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
    }))
  }

  public recordTutorialFileEdited() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
    }))
  }

  public recordTutorialCommitCreated() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
      tutorialCommitCreated: true,
    }))
  }

  public recordTutorialBranchPushed() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
      tutorialCommitCreated: true,
      tutorialBranchPushed: true,
    }))
  }

  public recordTutorialPrCreated() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
      tutorialCommitCreated: true,
      tutorialBranchPushed: true,
      tutorialPrCreated: true,
    }))
  }

  public recordTutorialCompleted() {
    return this.updateDailyMeasures(() => ({ tutorialCompleted: true }))
  }

  public recordHighestTutorialStepCompleted(step: number) {
    return this.updateDailyMeasures(m => ({
      highestTutorialStepCompleted: Math.max(
        step,
        m.highestTutorialStepCompleted
      ),
    }))
  }

  /**
   * Record that the user made a commit in a repository they don't have `write`
   * access to. Dedupes based on the database ID provided
   *
   * @param gitHubRepositoryDbId database ID for the GitHubRepository of the
   *                             local repo this commit was made in
   */
  public recordRepositoryCommitedInWithoutWriteAccess(
    gitHubRepositoryDbId: number
  ) {
    const ids = getNumberArray(RepositoriesCommittedInWithoutWriteAccessKey)
    if (!ids.includes(gitHubRepositoryDbId)) {
      setNumberArray(RepositoriesCommittedInWithoutWriteAccessKey, [
        ...ids,
        gitHubRepositoryDbId,
      ])
    }
  }

  public recordTagCreated = (numCreatedTags: number) =>
    this.increment('tagsCreated', numCreatedTags)

  private recordSquashUndone = () => this.increment('squashUndoneCount')

  public async recordOperationConflictsEncounteredCount(
    kind: MultiCommitOperationKind
  ): Promise<void> {
    switch (kind) {
      case MultiCommitOperationKind.Squash:
        return this.increment('squashConflictsEncounteredCount')
      case MultiCommitOperationKind.Reorder:
        return this.increment('reorderConflictsEncounteredCount')
      case MultiCommitOperationKind.Rebase:
        // ignored because rebase records different stats
        return
      case MultiCommitOperationKind.CherryPick:
      case MultiCommitOperationKind.Merge:
        log.error(
          `[recordOperationConflictsEncounteredCount] - Operation not supported: ${kind}`
        )
        return
      default:
        return assertNever(kind, `Unknown operation kind of ${kind}.`)
    }
  }

  public async recordOperationSuccessful(
    kind: MultiCommitOperationKind
  ): Promise<void> {
    switch (kind) {
      case MultiCommitOperationKind.Squash:
        return this.increment('squashSuccessfulCount')
      case MultiCommitOperationKind.Reorder:
        return this.increment('reorderSuccessfulCount')
      case MultiCommitOperationKind.CherryPick:
        return this.increment('cherryPickSuccessfulCount')
      case MultiCommitOperationKind.Rebase:
        // ignored because rebase records different stats
        return
      case MultiCommitOperationKind.Merge:
        log.error(
          `[recordOperationSuccessful] - Operation not supported: ${kind}`
        )
        return
      default:
        return assertNever(kind, `Unknown operation kind of ${kind}.`)
    }
  }

  public async recordOperationSuccessfulWithConflicts(
    kind: MultiCommitOperationKind
  ): Promise<void> {
    switch (kind) {
      case MultiCommitOperationKind.Squash:
        return this.increment('squashSuccessfulWithConflictsCount')
      case MultiCommitOperationKind.Reorder:
        return this.increment('reorderSuccessfulWithConflictsCount')
      case MultiCommitOperationKind.Rebase:
        return this.increment('rebaseSuccessAfterConflictsCount')
      case MultiCommitOperationKind.CherryPick:
      case MultiCommitOperationKind.Merge:
        log.error(
          `[recordOperationSuccessfulWithConflicts] - Operation not supported: ${kind}`
        )
        return
      default:
        return assertNever(kind, `Unknown operation kind of ${kind}.`)
    }
  }

  public async recordOperationUndone(
    kind: MultiCommitOperationKind
  ): Promise<void> {
    switch (kind) {
      case MultiCommitOperationKind.Squash:
        return this.recordSquashUndone()
      case MultiCommitOperationKind.Reorder:
        return this.increment('reorderUndoneCount')
      case MultiCommitOperationKind.CherryPick:
        return this.increment('cherryPickUndoneCount')
      case MultiCommitOperationKind.Rebase:
      case MultiCommitOperationKind.Merge:
        log.error(`[recordOperationUndone] - Operation not supported: ${kind}`)
        return
      default:
        return assertNever(kind, `Unknown operation kind of ${kind}.`)
    }
  }

  // Generates the stat field name for the given PR review type and suffix.
  private getStatFieldForRequestReviewState(
    reviewType: ValidNotificationPullRequestReviewState,
    suffix: PullRequestReviewStatFieldSuffix
  ): PullRequestReviewStatField {
    const infixMap: Record<
      ValidNotificationPullRequestReviewState,
      PullRequestReviewStatFieldInfix
    > = {
      CHANGES_REQUESTED: 'ChangesRequested',
      APPROVED: 'Approved',
      COMMENTED: 'Commented',
    }

    return `pullRequestReview${infixMap[reviewType]}${suffix}`
  }

  // Generic method to record stats related to Pull Request review
  // notifications.
  private recordPullRequestReviewStat(
    reviewType: ValidNotificationPullRequestReviewState,
    suffix: PullRequestReviewStatFieldSuffix
  ) {
    const statField = this.getStatFieldForRequestReviewState(reviewType, suffix)
    return this.increment(statField)
  }

  public recordPullRequestReviewNotificationShown(
    reviewType: ValidNotificationPullRequestReviewState
  ): Promise<void> {
    return this.recordPullRequestReviewStat(reviewType, 'NotificationCount')
  }

  public recordPullRequestReviewNotificationClicked(
    reviewType: ValidNotificationPullRequestReviewState
  ): Promise<void> {
    return this.recordPullRequestReviewStat(reviewType, 'NotificationClicked')
  }

  public recordPullRequestReviewDialogSwitchToPullRequest(
    reviewType: ValidNotificationPullRequestReviewState
  ): Promise<void> {
    return this.recordPullRequestReviewStat(
      reviewType,
      'DialogSwitchToPullRequestCount'
    )
  }

  public increment = (k: keyof NumericMeasures, n = 1) =>
    this.updateDailyMeasures(
      m => ({ [k]: m[k] + n } as Pick<IDailyMeasures, keyof NumericMeasures>)
    )

  /**
   * Send opt-in ping with details of previous stored value (if known)
   *
   * @param optOut        Whether or not the user has opted out of usage
   *                      reporting.
   * @param previousValue The raw, current value stored for the "stats-opt-out"
   *                      localStorage key, or undefined if no previously stored
   *                      value exists.
   */
  private async sendOptInStatusPing(
    optOut: boolean,
    previousValue: boolean | undefined
  ): Promise<void> {
    // The analytics pipeline expects us to submit `optIn` but we track `optOut`
    // so we need to invert the value before we send it.
    const optIn = !optOut
    const previousOptInValue =
      previousValue === undefined ? null : !previousValue
    const direction = optIn ? 'in' : 'out'

    try {
      const response = await this.post({
        eventType: 'ping',
        optIn,
        previousOptInValue,
      })
      if (!response.ok) {
        throw new Error(
          `Unexpected status: ${response.statusText} (${response.status})`
        )
      }

      setBoolean(HasSentOptInPingKey, true)

      log.info(`Opt ${direction} reported.`)
    } catch (e) {
      log.error(`Error reporting opt ${direction}:`, e)
    }
  }
}

/**
 * Store the current date (in unix time) in localStorage.
 *
 * If the provided key already exists it will not be overwritten.
 */
function createLocalStorageTimestamp(key: string) {
  if (localStorage.getItem(key) === null) {
    setNumber(key, Date.now())
  }
}

/**
 * Get a time stamp (in unix time) from localStorage.
 *
 * If the key doesn't exist or if the stored value can't be converted into a
 * number this method will return null.
 */
function getLocalStorageTimestamp(key: string): number | null {
  return getNumber(key) ?? null
}

/**
 * Calculate the duration (in seconds) between the time the welcome wizard was
 * initiated to the time for the given action.
 *
 * If no time stamp exists for when the welcome wizard was initiated, which
 * would be the case if the user completed the wizard before we introduced
 * onboarding metrics, or if the delta between the two values are negative
 * (which could happen if a user manually manipulated localStorage in order to
 * run the wizard again) this method will return undefined.
 */
function timeTo(key: string): number | undefined {
  const startTime = getLocalStorageTimestamp(WelcomeWizardInitiatedAtKey)

  if (startTime === null) {
    return undefined
  }

  const endTime = getLocalStorageTimestamp(key)
  return endTime === null || endTime <= startTime
    ? -1
    : Math.round((endTime - startTime) / 1000)
}

/**
 * Get a string representing the sign in method that was used when
 * authenticating a user in the welcome flow. This method ensures that the
 * reported value is known to the analytics system regardless of whether the
 * enum value of the SignInMethod type changes.
 */
function getWelcomeWizardSignInMethod(): 'basic' | 'web' | undefined {
  const method = localStorage.getItem(WelcomeWizardSignInMethodKey) ?? undefined

  if (method === 'basic' || method === 'web' || method === undefined) {
    return method
  }

  log.error(`Could not parse welcome wizard sign in method: ${method}`)
  return undefined
}

/**
 * Return a value indicating whether the user has opted out of stats reporting
 * or not.
 */
export function getHasOptedOutOfStats() {
  return getBoolean(StatsOptOutKey)
}
