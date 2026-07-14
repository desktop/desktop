import { shortenSHA } from '../../models/commit'
import { GitHubRepository } from '../../models/github-repository'
import { PullRequest, getPullRequestCommitRef } from '../../models/pull-request'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { Dispatcher, defaultErrorHandler } from '../../ui/dispatcher'
import { API, APICheckConclusion, IAPIComment } from '../api'
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
  private cachedComments: Map<number, ReadonlyArray<IAPIComment>> = new Map()
  private cachedReviews: Map<
    number,
    ReadonlyArray<ValidNotificationPullRequestReview>
  > = new Map()

  public constructor(
    private readonly accountsStore: AccountsStore,
    private readonly notificationsStore: NotificationsStore,
    private readonly pullRequestCoordinator: PullRequestCoordinator
  ) {}

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
        const cachedComments = this.cachedComments.get(pr.pullRequestNumber)

        if (cachedComments && cachedComments.length > 0) {
          filteredPrs.push(pr)
          continue
        }

        const comments = await this.getPullRequestComments(
          repository,
          pr.pullRequestNumber
        )
        this.cachedComments.set(pr.pullRequestNumber, comments)

        if (comments.length > 0) {
          filteredPrs.push(pr)
        }
      }

      if (options.filterByReviews) {
        const cachedReviews = this.cachedReviews.get(pr.pullRequestNumber)

        if (cachedReviews && cachedReviews.length > 0) {
          filteredPrs.push(pr)
          continue
        }

        const reviews = await this.getPullRequestReviews(
          repository,
          pr.pullRequestNumber
        )

        this.cachedReviews.set(pr.pullRequestNumber, reviews)

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
    const cachedReviews = this.cachedReviews.get(pullRequestNumber)
    if (cachedReviews) {
      return cachedReviews
    }

    const api = await this.getAPIForRepository(repository.gitHubRepository)
    if (api === null) {
      return []
    }

    const ghRepository = repository.gitHubRepository

    const reviews = await api.fetchPullRequestReviews(
      ghRepository.owner.login,
      ghRepository.name,
      pullRequestNumber.toString()
    )

    return reviews.filter(isValidNotificationPullRequestReview)
  }

  /** Fetch all comments (issue and review comments) for the given pull request. */
  public async getPullRequestComments(
    repository: RepositoryWithGitHubRepository,
    pullRequestNumber: number
  ) {
    const cachedComments = this.cachedComments.get(pullRequestNumber)
    if (cachedComments) {
      return cachedComments
    }

    const api = await this.getAPIForRepository(repository.gitHubRepository)
    if (api === null) {
      return []
    }

    const ghRepository = repository.gitHubRepository

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

    return [...issueComments, ...reviewComments]
  }

  /** Simulate a notification for the given pull request review. */
  public simulatePullRequestReviewNotification(
    repository: GitHubRepository,
    pullRequest: PullRequest,
    review: ValidNotificationPullRequestReview
  ) {
    this.notificationsStore.simulateAliveEvent({
      type: 'pr-review-submit',
      timestamp: new Date(review.submitted_at).getTime(),
      owner: repository.owner.login,
      repo: repository.name,
      pull_request_number: pullRequest.pullRequestNumber,
      state: review.state,
      review_id: review.id.toString(),
    })
  }

  /** Simulate a notification for the given pull request comment. */
  public simulatePullRequestCommentNotification(
    repository: GitHubRepository,
    pullRequest: PullRequest,
    comment: IAPIComment,
    isIssueComment: boolean
  ) {
    this.notificationsStore.simulateAliveEvent({
      type: 'pr-comment',
      subtype: isIssueComment ? 'issue-comment' : 'review-comment',
      timestamp: new Date(comment.created_at).getTime(),
      owner: repository.owner.login,
      repo: repository.name,
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
      repository.gitHubRepository,
      commitRef
    )

    if (!checks) {
      defaultErrorHandler(new Error('Could not get checks for PR'), dispatcher)
      return
    }

    const event: IDesktopChecksFailedAliveEvent = {
      type: 'pr-checks-failed',
      timestamp: new Date(pullRequest.created).getTime(),
      owner: repository.gitHubRepository.owner.login,
      repo: repository.name,
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
