import { PullRequestStore } from '../pull-request-store'
import { Account } from '../../../models/account'
import { fatalError } from '../../fatal-error'
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

  private currentPullRequests: ReadonlyArray<PullRequest> = []

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
    if (!this.isStopped) {
      fatalError(
        'Cannot start the Pull Request Updater that is already running.'
      )

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
    const pullRequests = this.currentPullRequests

    for (const pr of pullRequests) {
      const status = await this.store.refreshSinglePullRequestStatus(
        this.repository,
        this.account,
        pr
      )

      console.log('status for', status)

      if (
        !status.totalCount ||
        status.state === 'success' ||
        status.state === 'failure'
      ) {
        this.currentPullRequests = this.currentPullRequests.filter(
          p => p.id === pr.id
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
