import { PullRequestStore } from '../pull-request-store'
import { Account } from '../../../models/account'
import { GitHubRepository } from '../../../models/github-repository'

//** Interval to check for pull requests */
const PullRequestInterval = 1000 * 60 * 10

/**
 * Acts as a service for downloading the latest pull request
 * and status info from GitHub.
 */
export class PullRequestUpdater {
  private intervalId: number | null = null

  public constructor(
    private readonly repository: GitHubRepository,
    private readonly account: Account,
    private readonly store: PullRequestStore
  ) {}

  /** Starts the updater */
  public start() {
    this.stop()
    this.intervalId = window.setInterval(() => {
      this.store.refreshPullRequests(this.repository, this.account)
    }, PullRequestInterval)
  }

  public stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}
