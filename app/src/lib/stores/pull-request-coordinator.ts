import { GitHubRepository } from '../../models/github-repository'
import { Account } from '../../models/account'
import { PullRequest } from '../../models/pull-request'
import { Emitter } from 'event-kit'
import { Repository } from '../../models/repository'
import { PullRequestStore } from '.'
import { PullRequestUpdater } from './helpers/pull-request-updater'
import { RepositoriesStore } from './repositories-store'

/** Layer between App Store and the Pull Request Store and Pull Request Updater */
export class PullRequestCoordinator {
  protected readonly emitter = new Emitter()
  private currentPullRequestUpdater: PullRequestUpdater | null = null

  public constructor(
    private readonly pullRequestStore: PullRequestStore,
    private readonly repositoriesStore: RepositoriesStore
  ) {}

  /** Register a function to be called when the store updates. */
  public onPullRequestsChanged(
    fn: (
      repository: Repository,
      pullRequests: ReadonlyArray<PullRequest>
    ) => void
  ) {}

  /** Register a function to be called when the store updates. */
  public onIsLoadingPullRequests(
    fn: (repository: GitHubRepository, isLoadingPullRequests: boolean) => void
  ) {}

  /** Loads all pull requests against the given repository. */
  public refreshPullRequests(repository: Repository, account: Account) {}

  public getAllPullRequests(repository: Repository) {}

  public startPullRequestUpdater(repository: Repository, account: Account) {
    if (this.currentPullRequestUpdater !== null) {
      this.stopPullRequestUpdater()
    }

    const { gitHubRepository } = repository

    if (account === null || gitHubRepository === null) {
      return
    }

    this.currentPullRequestUpdater = new PullRequestUpdater(
      gitHubRepository,
      account,
      this.pullRequestStore
    )
    this.currentPullRequestUpdater.start()
  }
  public stopPullRequestUpdater() {
    if (this.currentPullRequestUpdater !== null) {
      this.currentPullRequestUpdater.stop()
      this.currentPullRequestUpdater = null
    }
  }
}
