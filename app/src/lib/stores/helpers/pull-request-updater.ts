import { PullRequestStore } from '../pull-request-store'
import { Account } from '../../../models/account'
import { fatalError, forceUnwrap } from '../../fatal-error'
import { PullRequest } from '../../../models/pull-request'
import { Repository } from '../../../models/repository'

//** Interval to check for pull requests */
const PullRequestInterval = 1000 * 60 * 10

//** Interval to check for pull request statuses */
const StatusInterval = 1000 * 60 * 10

//** Interval to check for pull request statuses after commits have been pushed */
const PostPushInterval = 1000 * 60

enum TimeoutHandles {
  PullRequest = 'PullRequestHandle',
  Status = 'StatusHandle',
  PushedPullRequest = 'PushedPullRequestHandle',
}

/**
 * Acts as a service for downloading the latest pull request
 * and status info from GitHub.
 */
export class PullRequestUpdater {
  private readonly repository: Repository
  private readonly account: Account
  private readonly store: PullRequestStore

  private readonly timeoutHandles = new Map<TimeoutHandles, number>()
  private isStopped: boolean = true

  private currentPullRequests: ReadonlyArray<PullRequest> = []

  public constructor(
    repository: Repository,
    account: Account,
    pullRequestStore: PullRequestStore
  ) {
    this.repository = repository
    this.account = account
    this.store = pullRequestStore
  }

  /** Starts the updater */
  public start() {
    const githubRepo = forceUnwrap(
      'Can only refresh pull requests for GitHub repositories',
      this.repository.gitHubRepository
    )

    if (!this.isStopped) {
      fatalError(
        'Cannot start the Pull Request Updater that is already running.'
      )

      return
    }

    this.timeoutHandles.set(
      TimeoutHandles.PullRequest,

      window.setTimeout(() => {
        this.store.fetchAndCachePullRequests(this.repository, this.account)
      }, PullRequestInterval)
    )

    this.timeoutHandles.set(
      TimeoutHandles.Status,
      window.setTimeout(() => {
        this.store.fetchPullRequestStatuses(githubRepo, this.account)
      }, StatusInterval)
    )
  }

  public stop() {
    this.isStopped = true

    for (const timeoutHandle of this.timeoutHandles.values()) {
      window.clearTimeout(timeoutHandle)
    }

    this.timeoutHandles.clear()
  }

  /** Starts fetching the statuses of PRs at an accelerated rate */
  public didPushPullRequest(pullRequest: PullRequest) {
    if (this.currentPullRequests.find(p => p.id === pullRequest.id)) {
      return
    }

    this.currentPullRequests = [...this.currentPullRequests, pullRequest]

    const pushedPRHandle = this.timeoutHandles.get(
      TimeoutHandles.PushedPullRequest
    )
    if (pushedPRHandle) {
      return
    }

    const handle = window.setTimeout(
      () => this.refreshPullRequestStatus(),
      PostPushInterval
    )
    this.timeoutHandles.set(TimeoutHandles.PushedPullRequest, handle)
  }

  private async refreshPullRequestStatus() {
    const githubRepo = forceUnwrap(
      'Can only refresh pull requests for GitHub repositories',
      this.repository.gitHubRepository
    )

    await this.store.fetchPullRequestStatuses(githubRepo, this.account)
    const prs = await this.store.fetchPullRequestsFromCache(githubRepo)

    for (const pr of prs) {
      const status = pr.status
      if (!status) {
        continue
      }

      if (
        !status.totalCount ||
        status.state === 'success' ||
        status.state === 'failure'
      ) {
        this.currentPullRequests = this.currentPullRequests.filter(
          p => p.pullRequestNumber !== status.pullRequestNumber
        )
      }
    }

    if (!this.currentPullRequests.length) {
      const handle = this.timeoutHandles.get(TimeoutHandles.PushedPullRequest)

      if (handle) {
        window.clearTimeout(handle)
        this.timeoutHandles.delete(TimeoutHandles.PushedPullRequest)
      }
    }
  }
}
