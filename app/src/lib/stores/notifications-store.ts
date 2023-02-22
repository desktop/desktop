import {
  Repository,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
  isRepositoryWithForkedGitHubRepository,
  getForkContributionTarget,
} from '../../models/repository'
import { ForkContributionTarget } from '../../models/workflow-preferences'
import { getPullRequestCommitRef, PullRequest } from '../../models/pull-request'
import { API, APICheckConclusion, IAPIComment } from '../api'
import {
  createCombinedCheckFromChecks,
  getLatestCheckRunsByName,
  apiStatusToRefCheck,
  apiCheckRunToRefCheck,
  IRefCheck,
} from '../ci-checks/ci-checks'
import { AccountsStore } from './accounts-store'
import { getCommit } from '../git'
import { GitHubRepository } from '../../models/github-repository'
import { PullRequestCoordinator } from './pull-request-coordinator'
import { Commit, shortenSHA } from '../../models/commit'
import {
  AliveStore,
  DesktopAliveEvent,
  IDesktopChecksFailedAliveEvent,
  IDesktopPullRequestCommentAliveEvent,
  IDesktopPullRequestReviewSubmitAliveEvent,
} from './alive-store'
import { setBoolean, getBoolean } from '../local-storage'
import { showNotification } from '../notifications/show-notification'
import { StatsStore } from '../stats'
import { truncateWithEllipsis } from '../truncate-with-ellipsis'
import { getVerbForPullRequestReview } from '../../ui/notifications/pull-request-review-helpers'
import {
  isValidNotificationPullRequestReview,
  ValidNotificationPullRequestReview,
} from '../valid-notification-pull-request-review'
import { NotificationCallback } from 'desktop-notifications/dist/notification-callback'
import { enablePullRequestCommentNotifications } from '../feature-flag'

type OnChecksFailedCallback = (
  repository: RepositoryWithGitHubRepository,
  pullRequest: PullRequest,
  commitMessage: string,
  commitSha: string,
  checkRuns: ReadonlyArray<IRefCheck>
) => void

type OnPullRequestReviewSubmitCallback = (
  repository: RepositoryWithGitHubRepository,
  pullRequest: PullRequest,
  review: ValidNotificationPullRequestReview
) => void

type OnPullRequestCommentCallback = (
  repository: RepositoryWithGitHubRepository,
  pullRequest: PullRequest,
  comment: IAPIComment
) => void

/**
 * The localStorage key for whether the user has enabled high-signal
 * notifications.
 */
const NotificationsEnabledKey = 'high-signal-notifications-enabled'

/** Whether or not the user has enabled high-signal notifications */
export function getNotificationsEnabled() {
  return getBoolean(NotificationsEnabledKey, true)
}

/**
 * This class manages the coordination between Alive events and actual OS-level
 * notifications.
 */
export class NotificationsStore {
  private repository: RepositoryWithGitHubRepository | null = null
  private recentRepositories: ReadonlyArray<Repository> = []
  private onChecksFailedCallback: OnChecksFailedCallback | null = null
  private onPullRequestReviewSubmitCallback: OnPullRequestReviewSubmitCallback | null =
    null
  private onPullRequestCommentCallback: OnPullRequestCommentCallback | null =
    null
  private cachedCommits: Map<string, Commit> = new Map()
  private skipCommitShas: Set<string> = new Set()
  private skipCheckRuns: Set<number> = new Set()

  public constructor(
    private readonly accountsStore: AccountsStore,
    private readonly aliveStore: AliveStore,
    private readonly pullRequestCoordinator: PullRequestCoordinator,
    private readonly statsStore: StatsStore
  ) {
    this.aliveStore.setEnabled(getNotificationsEnabled())
    this.aliveStore.onAliveEventReceived(this.onAliveEventReceived)
  }

  /** Enables or disables high-signal notifications entirely. */
  public setNotificationsEnabled(enabled: boolean) {
    const previousValue = getBoolean(NotificationsEnabledKey, true)

    if (previousValue === enabled) {
      return
    }

    setBoolean(NotificationsEnabledKey, enabled)
    this.aliveStore.setEnabled(enabled)
  }

  private onAliveEventReceived = async (e: DesktopAliveEvent) =>
    this.handleAliveEvent(e, false)

  public onNotificationEventReceived: NotificationCallback<DesktopAliveEvent> =
    async (event, id, userInfo) => this.handleAliveEvent(userInfo, true)

  public simulateAliveEvent(event: DesktopAliveEvent) {
    if (__DEV__) {
      this.handleAliveEvent(event, false)
    }
  }

  private async handleAliveEvent(
    e: DesktopAliveEvent,
    skipNotification: boolean
  ) {
    switch (e.type) {
      case 'pr-checks-failed':
        return this.handleChecksFailedEvent(e, skipNotification)
      case 'pr-review-submit':
        return this.handlePullRequestReviewSubmitEvent(e, skipNotification)
      case 'pr-comment':
        return this.handlePullRequestCommentEvent(e, skipNotification)
    }
  }

  private async handlePullRequestCommentEvent(
    event: IDesktopPullRequestCommentAliveEvent,
    skipNotification: boolean
  ) {
    if (!enablePullRequestCommentNotifications()) {
      return
    }

    const repository = this.repository
    if (repository === null) {
      return
    }

    if (!this.isValidRepositoryForEvent(repository, event)) {
      if (this.isRecentRepositoryEvent(event)) {
        this.statsStore.recordPullRequestReviewNotiificationFromRecentRepo()
      } else {
        this.statsStore.recordPullRequestReviewNotiificationFromNonRecentRepo()
      }
      return
    }

    const pullRequests = await this.pullRequestCoordinator.getAllPullRequests(
      repository
    )
    const pullRequest = pullRequests.find(
      pr => pr.pullRequestNumber === event.pull_request_number
    )

    // If the PR is not in cache, it probably means the user didn't work on it
    // recently, so we don't want to show a notification.
    if (pullRequest === undefined) {
      return
    }

    // Fetch comment from API depending on event subtype
    const api = await this.getAPIForRepository(repository.gitHubRepository)
    if (api === null) {
      return
    }

    const comment =
      event.subtype === 'issue-comment'
        ? await api.fetchIssueComment(event.owner, event.repo, event.comment_id)
        : await api.fetchPullRequestReviewComment(
            event.owner,
            event.repo,
            event.comment_id
          )

    if (comment === null) {
      return
    }

    const title = `@${comment.user.login} commented your pull request`
    const body = `${pullRequest.title} #${
      pullRequest.pullRequestNumber
    }\n${truncateWithEllipsis(comment.body, 50)}`
    const onClick = () => {
      // TODO: this.statsStore.recordPullRequestReviewNotificationClicked(review.state)

      this.onPullRequestCommentCallback?.(repository, pullRequest, comment)
    }

    if (skipNotification) {
      onClick()
      return
    }

    showNotification({
      title,
      body,
      userInfo: event,
      onClick,
    })

    // TODO: this.statsStore.recordPullRequestReviewNotificationShown(review.state)
  }

  private async handlePullRequestReviewSubmitEvent(
    event: IDesktopPullRequestReviewSubmitAliveEvent,
    skipNotification: boolean
  ) {
    const repository = this.repository
    if (repository === null) {
      return
    }

    if (!this.isValidRepositoryForEvent(repository, event)) {
      if (this.isRecentRepositoryEvent(event)) {
        this.statsStore.recordPullRequestReviewNotiificationFromRecentRepo()
      } else {
        this.statsStore.recordPullRequestReviewNotiificationFromNonRecentRepo()
      }
      return
    }

    const pullRequests = await this.pullRequestCoordinator.getAllPullRequests(
      repository
    )
    const pullRequest = pullRequests.find(
      pr => pr.pullRequestNumber === event.pull_request_number
    )

    // If the PR is not in cache, it probably means the user didn't work on it
    // from Desktop, so we can maybe ignore it?
    if (pullRequest === undefined) {
      return
    }

    // PR reviews must be retrieved from the repository the PR belongs to
    const pullsRepository = this.getContributingRepository(repository)
    const api = await this.getAPIForRepository(pullsRepository)

    if (api === null) {
      return
    }

    const review = await api.fetchPullRequestReview(
      pullsRepository.owner.login,
      pullsRepository.name,
      pullRequest.pullRequestNumber.toString(),
      event.review_id
    )

    if (review === null || !isValidNotificationPullRequestReview(review)) {
      return
    }

    const reviewVerb = getVerbForPullRequestReview(review)
    const title = `@${review.user.login} ${reviewVerb} your pull request`
    const body = `${pullRequest.title} #${
      pullRequest.pullRequestNumber
    }\n${truncateWithEllipsis(review.body, 50)}`
    const onClick = () => {
      this.statsStore.recordPullRequestReviewNotificationClicked(review.state)

      this.onPullRequestReviewSubmitCallback?.(repository, pullRequest, review)
    }

    if (skipNotification) {
      onClick()
      return
    }

    showNotification({
      title,
      body,
      userInfo: event,
      onClick,
    })

    this.statsStore.recordPullRequestReviewNotificationShown(review.state)
  }

  private async handleChecksFailedEvent(
    event: IDesktopChecksFailedAliveEvent,
    skipNotification: boolean
  ) {
    const repository = this.repository
    if (repository === null) {
      return
    }

    if (!this.isValidRepositoryForEvent(repository, event)) {
      if (this.isRecentRepositoryEvent(event)) {
        this.statsStore.recordChecksFailedNotificationFromRecentRepo()
      } else {
        this.statsStore.recordChecksFailedNotificationFromNonRecentRepo()
      }
      return
    }

    const pullRequests = await this.pullRequestCoordinator.getAllPullRequests(
      repository
    )
    const pullRequest = pullRequests.find(
      pr => pr.pullRequestNumber === event.pull_request_number
    )

    // If the PR is not in cache, it probably means it the checks weren't
    // triggered by a push from Desktop, so we can maybe ignore it?
    if (pullRequest === undefined) {
      return
    }

    const account = await this.getAccountForRepository(
      repository.gitHubRepository
    )

    if (account === null) {
      return
    }

    const commitSHA = event.commit_sha

    if (this.skipCommitShas.has(commitSHA)) {
      return
    }

    const commit =
      this.cachedCommits.get(commitSHA) ??
      (await getCommit(repository, commitSHA))
    if (commit === null) {
      this.skipCommitShas.add(commitSHA)
      return
    }

    this.cachedCommits.set(commitSHA, commit)

    if (!account.emails.map(e => e.email).includes(commit.author.email)) {
      this.skipCommitShas.add(commitSHA)
      return
    }

    // Checks must be retrieved from the repository the PR belongs to
    const checksRepository = this.getContributingRepository(repository)

    const checks = await this.getChecksForRef(
      checksRepository,
      getPullRequestCommitRef(pullRequest.pullRequestNumber)
    )
    if (checks === null) {
      return
    }

    // Make sure we haven't shown a notification for the check runs of this
    // check suite already.
    // If one of more jobs are re-run, the check suite will have the same ID
    // but different check runs.
    const checkSuiteCheckRunIds = checks.flatMap(check =>
      check.checkSuiteId === event.check_suite_id ? check.id : []
    )

    if (checkSuiteCheckRunIds.every(id => this.skipCheckRuns.has(id))) {
      return
    }

    const numberOfFailedChecks = checks.filter(
      check => check.conclusion === APICheckConclusion.Failure
    ).length

    // Sometimes we could get a checks-failed event for a PR whose checks just
    // got restarted, so we won't get failed checks at that point. In that
    // scenario, just ignore the event and don't show a notification.
    if (numberOfFailedChecks === 0) {
      return
    }

    // Ignore any remaining notification for check runs that started along
    // with this one.
    for (const check of checks) {
      this.skipCheckRuns.add(check.id)
    }

    const pluralChecks =
      numberOfFailedChecks === 1 ? 'check was' : 'checks were'

    const shortSHA = shortenSHA(commitSHA)
    const title = 'Pull Request checks failed'
    const body = `${pullRequest.title} #${pullRequest.pullRequestNumber} (${shortSHA})\n${numberOfFailedChecks} ${pluralChecks} not successful.`
    const onClick = () => {
      this.statsStore.recordChecksFailedNotificationClicked()

      this.onChecksFailedCallback?.(
        repository,
        pullRequest,
        commit.summary,
        commitSHA,
        checks
      )
    }

    if (skipNotification) {
      onClick()
      return
    }

    showNotification({
      title,
      body,
      userInfo: event,
      onClick,
    })

    this.statsStore.recordChecksFailedNotificationShown()
  }

  private getContributingRepository(
    repository: RepositoryWithGitHubRepository
  ) {
    const isForkContributingToParent =
      isRepositoryWithForkedGitHubRepository(repository) &&
      getForkContributionTarget(repository) === ForkContributionTarget.Parent

    return isForkContributingToParent
      ? repository.gitHubRepository.parent
      : repository.gitHubRepository
  }

  private isValidRepositoryForEvent(
    repository: RepositoryWithGitHubRepository,
    event: DesktopAliveEvent
  ) {
    // If it's a fork and set to contribute to the parent repository, try to
    // match the parent repository.
    if (
      isRepositoryWithForkedGitHubRepository(repository) &&
      getForkContributionTarget(repository) === ForkContributionTarget.Parent
    ) {
      const parentRepository = repository.gitHubRepository.parent
      return (
        parentRepository.owner.login === event.owner &&
        parentRepository.name === event.repo
      )
    }

    const ghRepository = repository.gitHubRepository
    return (
      ghRepository.owner.login === event.owner &&
      ghRepository.name === event.repo
    )
  }

  private isRecentRepositoryEvent(event: DesktopAliveEvent) {
    return this.recentRepositories.some(
      r =>
        isRepositoryWithGitHubRepository(r) &&
        this.isValidRepositoryForEvent(r, event)
    )
  }

  /**
   * Makes the store to keep track of the currently selected repository. Only
   * notifications for the currently selected repository will be shown.
   */
  public selectRepository(repository: Repository) {
    if (repository.hash === this.repository?.hash) {
      return
    }

    this.repository = isRepositoryWithGitHubRepository(repository)
      ? repository
      : null
    this.resetCache()
  }

  private resetCache() {
    this.cachedCommits.clear()
    this.skipCommitShas.clear()
    this.skipCheckRuns.clear()
  }

  /**
   * For stats purposes, we need to know which are the recent repositories. This
   * will allow the notification store when a notification is related to one of
   * these repositories.
   */
  public setRecentRepositories(repositories: ReadonlyArray<Repository>) {
    this.recentRepositories = repositories
  }

  private async getAccountForRepository(repository: GitHubRepository) {
    const { endpoint } = repository

    const accounts = await this.accountsStore.getAll()
    return accounts.find(a => a.endpoint === endpoint) ?? null
  }

  private async getAPIForRepository(repository: GitHubRepository) {
    const account = await this.getAccountForRepository(repository)

    if (account === null) {
      return null
    }

    return API.fromAccount(account)
  }

  private async getChecksForRef(repository: GitHubRepository, ref: string) {
    const { owner, name } = repository

    const api = await this.getAPIForRepository(repository)

    if (api === null) {
      return null
    }

    // Hit these API endpoints reloading the cache to make sure we have the
    // latest data at the time the notification is received.
    const [statuses, checkRuns] = await Promise.all([
      api.fetchCombinedRefStatus(owner.login, name, ref, true),
      api.fetchRefCheckRuns(owner.login, name, ref, true),
    ])

    const checks = new Array<IRefCheck>()

    if (statuses === null || checkRuns === null) {
      return null
    }

    if (statuses !== null) {
      checks.push(...statuses.statuses.map(apiStatusToRefCheck))
    }

    if (checkRuns !== null) {
      const latestCheckRunsByName = getLatestCheckRunsByName(
        checkRuns.check_runs
      )
      checks.push(...latestCheckRunsByName.map(apiCheckRunToRefCheck))
    }

    const check = createCombinedCheckFromChecks(checks)

    if (check === null || check.checks.length === 0) {
      return null
    }

    return check.checks
  }

  /** Observe when the user reacted to a "Checks Failed" notification. */
  public onChecksFailedNotification(callback: OnChecksFailedCallback) {
    this.onChecksFailedCallback = callback
  }

  /** Observe when the user reacted to a "PR review submit" notification. */
  public onPullRequestReviewSubmitNotification(
    callback: OnPullRequestReviewSubmitCallback
  ) {
    this.onPullRequestReviewSubmitCallback = callback
  }

  /** Observe when the user reacted to a "PR comment" notification. */
  public onPullRequestCommentNotification(
    callback: OnPullRequestCommentCallback
  ) {
    this.onPullRequestCommentCallback = callback
  }
}
