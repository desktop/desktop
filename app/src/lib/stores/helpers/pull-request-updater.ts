import { PullRequestStore } from '../pull-request-store'
import { Account } from '../../../models/account'
import { fatalError, forceUnwrap } from '../../fatal-error'
import { PullRequest } from '../../../models/pull-request'
import { GitHubRepository } from '../../../models/github-repository'

const PullRequestInterval = 1000 * 60 * 3
const StatusInterval = 1000 * 60
const PostPushInterval = 1000 * 60

enum TimeoutHandles {
  PullRequest = 'PullRequestHandle',
  Status = 'StatusHandle',
  PushedPullRequest = 'PushedPullRequestHandle',
}

export class PullRequestUpdater {
  private readonly repository: GitHubRepository
  private readonly account: Account
  private readonly store: PullRequestStore

  private readonly timeoutHandles = new Map<TimeoutHandles, number>()
  private isStopped: boolean = true

  private currentPullRequest: PullRequest | null = null

  public constructor(
    repository: GitHubRepository,
    account: Account,
    pullRequestStore: PullRequestStore
  ) {
    this.repository = repository
    this.account = account
    this.store = pullRequestStore
  }

  public start() {
    if (this.isStopped) {
      fatalError('Cannot start the Pull Request Updater that has been stopped.')

      return
    }

    this.timeoutHandles.set(
      TimeoutHandles.PullRequest,

      window.setTimeout(() => {
        this.store.refreshPullRequests(this.repository, this.account)
      }, PullRequestInterval)
    )

    this.timeoutHandles.set(
      TimeoutHandles.Status,
      window.setTimeout(() => {
        this.store.refreshPullRequestStatuses(this.repository, this.account)
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

  public didPushPullRequest(pullRequest: PullRequest) {
    this.setCurrentPullRequest(pullRequest)
  }

  private setCurrentPullRequest(pullRequest: PullRequest | null) {
    if (
      pullRequest &&
      this.currentPullRequest &&
      pullRequest.id === this.currentPullRequest.id
    ) {
      return
    }

    this.currentPullRequest = pullRequest

    if (pullRequest) {
      const handle = window.setTimeout(
        () => this.refreshPullRequestStatus(),
        PostPushInterval
      )
      this.timeoutHandles.set(TimeoutHandles.PushedPullRequest, handle)
    } else {
      const pushedPRHandle = this.timeoutHandles.get(
        TimeoutHandles.PushedPullRequest
      )
      if (pushedPRHandle) {
        window.clearTimeout(pushedPRHandle)
        this.timeoutHandles.delete(TimeoutHandles.PushedPullRequest)
      }
    }
  }

  private async refreshPullRequestStatus() {
    const pullRequest = forceUnwrap(
      'Should not refresh status when there is no pull request',
      this.currentPullRequest
    )

    const status = await this.store.refreshSinglePullRequestStatus(
      this.repository,
      this.account,
      pullRequest
    )

    console.log('status for', status)

    if (
      !status.totalCount ||
      status.state === 'success' ||
      status.state === 'failure'
    ) {
      this.setCurrentPullRequest(null)
    }
  }
}
