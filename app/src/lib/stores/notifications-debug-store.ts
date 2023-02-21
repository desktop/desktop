import { GitHubRepository } from '../../models/github-repository'
import { PullRequest } from '../../models/pull-request'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { API, IAPIComment } from '../api'
import {
  isValidNotificationPullRequestReview,
  ValidNotificationPullRequestReview,
} from '../valid-notification-pull-request-review'
import { AccountsStore } from './accounts-store'
import { NotificationsStore } from './notifications-store'
import { PullRequestCoordinator } from './pull-request-coordinator'

/**
 * This class allows the TestNotifications dialog to fetch real data to simulate
 * notifications.
 */
export class NotificationsDebugStore {
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
  public async getPullRequests(repository: RepositoryWithGitHubRepository) {
    return this.pullRequestCoordinator.getAllPullRequests(repository)
  }

  /** Fetch all reviews for the given pull request. */
  public async getPullRequestReviews(
    repository: RepositoryWithGitHubRepository,
    pullRequestNumber: number
  ) {
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
}
