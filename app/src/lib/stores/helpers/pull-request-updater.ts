import { PullRequestStore } from '../pull-request-store'
import { Repository } from '../../../models/repository'
import { Account } from '../../../models/account'
import { fatalError } from '../../fatal-error'

const PullRequestInterval = 1000 * 60 * 3
const StatusInterval = 1000 * 60
const PostPushInterval = 1000 * 60

enum TimeoutHandles {
  PullRequest = 'PullRequestHandle',
  Status = 'StatusHandle',
  PushedPullRequest = 'PushedPullRequestHandle',
}

export enum PullRequestUpdaterState {
  Normal,
  PostPush,
}

export class PullRequestUpdater {
  private readonly repository: Repository
  private readonly account: Account
  private readonly store: PullRequestStore

  private readonly timeoutHandles = new Map<TimeoutHandles, number>()
  private isStopped: boolean = true

  private currentState = PullRequestUpdaterState.Normal

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

  public setState(newState: PullRequestUpdaterState) {
    if (newState === this.currentState) {
      return
    }

    this.currentState = newState

    switch (newState) {
      case PullRequestUpdaterState.Normal:
        {
          const pushedPRHandle = this.timeoutHandles.get(
            TimeoutHandles.PushedPullRequest
          )
          if (pushedPRHandle) {
            window.clearTimeout(pushedPRHandle)
            this.timeoutHandles.delete(TimeoutHandles.PushedPullRequest)
          }
        }
        break
      case PullRequestUpdaterState.PostPush: {
        const handle = window.setTimeout(() => {}, PostPushInterval)
        this.timeoutHandles.set(TimeoutHandles.PushedPullRequest, handle)
      }
    }
  }
}
