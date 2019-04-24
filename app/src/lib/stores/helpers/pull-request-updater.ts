import { PullRequestStore } from '../pull-request-store'
import { Account } from '../../../models/account'
import { fatalError } from '../../fatal-error'
import { GitHubRepository } from '../../../models/github-repository'

//** Interval to check for pull requests */
const PullRequestInterval = 1000 * 60 * 10

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
  private readonly timeoutHandles = new Map<TimeoutHandles, number>()
  private isStopped: boolean = true

  public constructor(
    private readonly repository: GitHubRepository,
    private readonly account: Account,
    private readonly store: PullRequestStore
  ) {}

  /** Starts the updater */
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
  }

  public stop() {
    this.isStopped = true

    for (const timeoutHandle of this.timeoutHandles.values()) {
      window.clearTimeout(timeoutHandle)
    }

    this.timeoutHandles.clear()
  }
}
