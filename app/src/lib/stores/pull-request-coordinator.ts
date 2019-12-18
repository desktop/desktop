import { GitHubRepository } from '../../models/github-repository'
import { Account } from '../../models/account'
import { PullRequest } from '../../models/pull-request'
import { Emitter } from 'event-kit'
import { Repository } from '../../models/repository'
import { PullRequestStore } from '.'

/** Layer between App Store and the Pull Request Store and Pull Request Updater */
export class PullRequestCoordinator {
  protected readonly emitter = new Emitter()

  public constructor(private readonly pullRequestStore: PullRequestStore) {}

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
  public refreshPullRequests(repo: GitHubRepository, account: Account) {}
}
