import { Account } from '../../models/account'
import { PullRequest } from '../../models/pull-request'
import {
  RepositoryWithGitHubRepository,
  isRepositoryWithGitHubRepository,
  Repository,
} from '../../models/repository'
import { PullRequestStore } from '.'
import { PullRequestUpdater } from './helpers/pull-request-updater'
import { RepositoriesStore } from './repositories-store'
import { GitHubRepository } from '../../models/github-repository'

/**
 * One stop shop for all things pull requests.
 *
 * Manages the association between GitHubRepositories and
 * local Repositories. In other words, it's a layer between
 * AppStore and the PullRequestStore + PullRequestUpdaters.
 */
export class PullRequestCoordinator {
  private currentPullRequestUpdater: PullRequestUpdater | null = null
  private repositories: ReadonlyArray<
    RepositoryWithGitHubRepository
  > = new Array<RepositoryWithGitHubRepository>()

  public constructor(
    private readonly pullRequestStore: PullRequestStore,
    private readonly repositoriesStore: RepositoriesStore
  ) {
    // register an update handler for the repositories store
    this.repositoriesStore.onDidUpdate(allRepositories => {
      this.repositories = allRepositories.filter(
        isRepositoryWithGitHubRepository
      )
    })
  }

  /** Register a function to be called when the PullRequestStore updates */
  public onPullRequestsChanged(
    fn: (
      repository: RepositoryWithGitHubRepository,
      pullRequests: ReadonlyArray<PullRequest>
    ) => void
  ) {
    return this.pullRequestStore.onPullRequestsChanged(
      (ghRepo, pullRequests) => {
        const repository = findRepositoryForGitHubRepository(
          ghRepo,
          this.repositories
        )
        if (repository !== undefined) {
          fn(repository, pullRequests)
        }
      }
    )
  }

  /** Register a function to be called when PullRequestStore emits a loading event */
  public onIsLoadingPullRequests(
    fn: (
      repository: RepositoryWithGitHubRepository,
      isLoadingPullRequests: boolean
    ) => void
  ) {
    return this.pullRequestStore.onIsLoadingPullRequests(
      (ghRepo, pullRequests) => {
        const repository = findRepositoryForGitHubRepository(
          ghRepo,
          this.repositories
        )
        if (repository !== undefined) {
          fn(repository, pullRequests)
        }
      }
    )
  }

  /** Loads (from remote) all pull requests for the given repository. */
  public refreshPullRequests(
    repository: RepositoryWithGitHubRepository,
    account: Account
  ) {
    return this.pullRequestStore.refreshPullRequests(
      repository.gitHubRepository,
      account
    )
  }

  /** Get all Pull Requests for the given Repository that are in the PullRequestStore */
  public getAllPullRequests(repository: RepositoryWithGitHubRepository) {
    return this.pullRequestStore.getAll(repository.gitHubRepository)
  }

  /** Start background Pull Request updates machinery for this Repository */
  public startPullRequestUpdater(
    repository: RepositoryWithGitHubRepository,
    account: Account
  ) {
    if (this.currentPullRequestUpdater !== null) {
      this.stopPullRequestUpdater()
    }

    this.currentPullRequestUpdater = new PullRequestUpdater(
      repository.gitHubRepository,
      account,
      this.pullRequestStore
    )
    this.currentPullRequestUpdater.start()
  }

  /** Stop background Pull Request updates machinery for this Repository */
  public stopPullRequestUpdater() {
    if (this.currentPullRequestUpdater !== null) {
      this.currentPullRequestUpdater.stop()
      this.currentPullRequestUpdater = null
    }
  }
}

/**
 * Helper for matching a GitHubRepository to a single Repository
 *
 * @param gitHubRepository
 * @param repositories list of repositories to search for a match
 *
 */
function findRepositoryForGitHubRepository(
  gitHubRepository: GitHubRepository,
  repositories: ReadonlyArray<Repository>
) {
  const repo = repositories.find(
    r =>
      r.gitHubRepository !== null &&
      r.gitHubRepository.dbID === gitHubRepository.dbID
  )
  return repo !== undefined && isRepositoryWithGitHubRepository(repo)
    ? repo
    : undefined
}
