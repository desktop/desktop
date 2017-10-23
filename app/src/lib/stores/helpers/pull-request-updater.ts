import { PullRequestStore } from '../pull-request-store'
import { Repository } from '../../../models/repository'
import { Account } from '../../../models/account'
import { fatalError } from '../../fatal-error'

const PullRequestInterval = 1000 * 60 * 3
const StatusInterval = 1000 * 60

enum TimeoutHandles {
  PullRequest = 'PullRequestHandle',
  Status = 'StatusHandle',
}

export class PullRequestUpdater {
  private readonly repository: Repository
  private readonly account: Account
  private readonly store: PullRequestStore

  private readonly timeoutHandles = new Map<TimeoutHandles, number>()
  private isStopped: boolean = true

  public constructor(
    repository: Repository,
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
    const gitHubRepository = this.repository.gitHubRepository

    if (!gitHubRepository) {
      return
    }

    this.timeoutHandles.set(
      TimeoutHandles.PullRequest,

      window.setTimeout(() => {
        this.store.refreshPullRequests(gitHubRepository, this.account)
      }, PullRequestInterval)
    )

    this.timeoutHandles.set(
      TimeoutHandles.Status,
      window.setTimeout(() => {
        this.store.refreshPullRequestStatuses(gitHubRepository, this.account)
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
}
