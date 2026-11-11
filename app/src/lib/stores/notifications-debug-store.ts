import { shortenSHA } from '../../models/commit'
import { PullRequest, getPullRequestCommitRef } from '../../models/pull-request'
import {
  RepositoryWithGitHubRepository,
  getNonForkGitHubRepository,
} from '../../models/repository'
import { Dispatcher, defaultErrorHandler } from '../../ui/dispatcher'
import { API, APICheckConclusion, IAPIComment } from '../api'
import { getAccountForRepository } from '../get-account-for-repository'
import { showNotification } from '../notifications/show-notification'
import {
  isValidNotificationPullRequestReview,
  ValidNotificationPullRequestReview,
} from '../valid-notification-pull-request-review'
import { AccountsStore } from './accounts-store'
import { IDesktopChecksFailedAliveEvent } from './alive-store'
import { NotificationsStore } from './notifications-store'
import { PullRequestCoordinator } from './pull-request-coordinator'

/**
 * This class allows the TestNotifications dialog to fetch real data to simulate
 * notifications.
 */
export class NotificationsDebugStore {
  private cachedComments: Map<string, ReadonlyArray<IAPIComment>> = new Map()
  private cachedReviews: Map<
    string,
    ReadonlyArray<ValidNotificationPullRequestReview>
  > = new Map()

  public constructor(
    private readonly accountsStore: AccountsStore,
    private readonly notificationsStore: NotificationsStore,
    private readonly pullRequestCoordinator: PullRequestCoordinator
  ) {}

  private async getAPIForRepository(
    repository: RepositoryWithGitHubRepository
  ) {
    const accounts = await this.accountsStore.getAll()
    const account = getAccountForRepository(accounts, repository)

    if (account === null) {
      return null
    }

    return API.fromAccount(account)
  }

  private getCacheKey(
    repository: RepositoryWithGitHubRepository,
    pullRequestNumber: number
  ) {
    const target = getNonForkGitHubRepository(repository)
    return JSON.stringify([
      repository.gitHubRepository.endpoint,
      repository.login?.toLowerCase(),
      target.owner.login,
      target.name,
      pullRequestNumber,
    ])
  }

  /** Fetch all pull requests for the given repository. */
  public async getPullRequests(
    repository: RepositoryWithGitHubRepository,
    options: { filterByComments?: boolean; filterByReviews?: boolean }
  ) {
    const prs = await this.pullRequestCoordinator.getAllPullRequests(repository)

    if (!options.filterByComments && !options.filterByReviews) {
      return prs
    }

    const filteredPrs = []
    for (const pr of prs) {
      if (options.filterByComments) {
        const comments = await this.getPullRequestComments(
          repository,
          pr.pullRequestNumber
        )

        if (comments.length > 0) {
          filteredPrs.push(pr)
          continue
        }
      }

      if (options.filterByReviews) {
        const reviews = await this.getPullRequestReviews(
          repository,
          pr.pullRequestNumber
        )

        if (reviews.length > 0) {
          filteredPrs.push(pr)
        }
      }
    }

    return filteredPrs
  }

  /** Fetch all reviews for the given pull request. */
  public async getPullRequestReviews(
    repository: RepositoryWithGitHubRepository,
    pullRequestNumber: number
  ) {
    const api = await this.getAPIForRepository(repository)
    if (api === null) {
      return []
    }
    const key = this.getCacheKey(repository, pullRequestNumber)
    const cachedReviews = this.cachedReviews.get(key)
    if (cachedReviews) {
      return cachedReviews
    }

    const ghRepository = getNonForkGitHubRepository(repository)

    const reviews = await api.fetchPullRequestReviews(
      ghRepository.owner.login,
      ghRepository.name,
      pullRequestNumber.toString()
    )

    const validReviews = reviews.filter(isValidNotificationPullRequestReview)
    this.cachedReviews.set(key, validReviews)
    return validReviews
  }

  /** Fetch all comments (issue and review comments) for the given pull request. */
  public async getPullRequestComments(
    repository: RepositoryWithGitHubRepository,
    pullRequestNumber: number
  ) {
    const api = await this.getAPIForRepository(repository)
    if (api === null) {
      return []
    }
    const key = this.getCacheKey(repository, pullRequestNumber)
    const cachedComments = this.cachedComments.get(key)
    if (cachedComments) {
      return cachedComments
    }

    const ghRepository = getNonForkGitHubRepository(repository)

    const issueComments = await api.fetchIssueComments(
      ghRepository.owner.login,
      ghRepository.name,
      pullRequestNumber.toString()
    )

    const reviewComments = await api.fetchPullRequestComments(
      ghRepository.owner.login,
      ghRepository.name,
      pullRequestNumber.toString()
    )

    const comments = [...issueComments, ...reviewComments]
    this.cachedComments.set(key, comments)
    return comments
  }

  /** Simulate a notification for the given pull request review. */
  public simulatePullRequestReviewNotification(
    repository: RepositoryWithGitHubRepository,
    pullRequest: PullRequest,
    review: ValidNotificationPullRequestReview
  ) {
    const target = getNonForkGitHubRepository(repository)
    this.notificationsStore.simulateAliveEvent({
      type: 'pr-review-submit',
      timestamp: new Date(review.submitted_at).getTime(),
      owner: target.owner.login,
      repo: target.name,
      pull_request_number: pullRequest.pullRequestNumber,
      state: review.state,
      review_id: review.id.toString(),
    })
  }

  /** Simulate a notification for the given pull request comment. */
  public simulatePullRequestCommentNotification(
    repository: RepositoryWithGitHubRepository,
    pullRequest: PullRequest,
    comment: IAPIComment,
    isIssueComment: boolean
  ) {
    const target = getNonForkGitHubRepository(repository)
    this.notificationsStore.simulateAliveEvent({
      type: 'pr-comment',
      subtype: isIssueComment ? 'issue-comment' : 'review-comment',
      timestamp: new Date(comment.created_at).getTime(),
      owner: target.owner.login,
      repo: target.name,
      pull_request_number: pullRequest.pullRequestNumber,
      comment_id: comment.id.toString(),
    })
  }

  /** Simulate a notification for pull request checks failure for the given PR. */
  public async simulatePullRequestChecksFailed(
    repository: RepositoryWithGitHubRepository,
    pullRequest: PullRequest,
    dispatcher: Dispatcher
  ) {
    const commitSha = pullRequest.head.sha
    const commitRef = getPullRequestCommitRef(pullRequest.pullRequestNumber)
    const checks = await this.notificationsStore.getChecksForRef(
      repository,
      commitRef
    )

    if (!checks) {
      defaultErrorHandler(new Error('Could not get checks for PR'), dispatcher)
      return
    }

    const target = getNonForkGitHubRepository(repository)
    const event: IDesktopChecksFailedAliveEvent = {
      type: 'pr-checks-failed',
      timestamp: new Date(pullRequest.created).getTime(),
      owner: target.owner.login,
      repo: target.name,
      pull_request_number: pullRequest.pullRequestNumber,
      check_suite_id: checks[0].checkSuiteId ?? 0,
      commit_sha: commitSha,
    }

    const numberOfFailedChecks = checks.filter(
      check => check.conclusion === APICheckConclusion.Failure
    ).length

    const pluralChecks =
      numberOfFailedChecks === 1 ? 'check was' : 'checks were'

    const shortSHA = shortenSHA(commitSha)
    const title = 'Pull Request checks failed'
    const body = `${pullRequest.title} #${pullRequest.pullRequestNumber} (${shortSHA})\n${numberOfFailedChecks} ${pluralChecks} not successful.`
    const onClick = () => {
      dispatcher.onChecksFailedNotification(repository, pullRequest, checks)
    }

    showNotification({
      title,
      body,
      userInfo: event,
      onClick,
    })
  }
}
