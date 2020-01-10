import { Account } from '../../models/account'
import { PullRequest } from '../../models/pull-request'
import {
  RepositoryWithGitHubRepository,
  isRepositoryWithGitHubRepository,
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

  /** Map GitHubRepository database IDs to Pull Request Lists */
  private readonly prCache = new Map<number, ReadonlyArray<PullRequest>>()

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
        // update cache
        if (ghRepo.dbID !== null) {
          this.prCache.set(ghRepo.dbID, pullRequests)
        }

        // find all related repos
        const { matches, forks } = findRepositoriesForGitHubRepository(
          ghRepo,
          this.repositories
        )

        // emit updates for forks
        for (const fork of forks) {
          this.getPullRequestsFor(fork.gitHubRepository).then(prs =>
            fn(fork, [...prs, ...pullRequests])
          )
        }

        // emit updates for matches
        for (const match of matches) {
          fn(match, pullRequests)
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
        const { matches, forks } = findRepositoriesForGitHubRepository(
          ghRepo,
          this.repositories
        )
        for (const repo of [...matches, ...forks]) {
          fn(repo, pullRequests)
        }
      }
    )
  }

  /** Loads (from remote) all pull requests for the given repository and its upstreams. */
  public refreshPullRequests(
    repository: RepositoryWithGitHubRepository,
    account: Account
  ) {
    if (repository.gitHubRepository.parent !== null) {
      return Promise.all([
        this.pullRequestStore.refreshPullRequests(
          repository.gitHubRepository,
          account
        ),
        this.pullRequestStore.refreshPullRequests(
          repository.gitHubRepository.parent,
          account
        ),
      ])
    } else {
      return this.pullRequestStore.refreshPullRequests(
        repository.gitHubRepository,
        account
      )
    }
  }

  /**
   * Get all Pull Requests that are stored locally for the given Repository
   * (Doesn't load anything from the GitHub API.)
   */
  public async getAllPullRequests(
    repository: RepositoryWithGitHubRepository
  ): Promise<ReadonlyArray<PullRequest>> {
    if (repository.gitHubRepository.parent !== null) {
      const [prs, upstreamPrs] = await Promise.all([
        this.getPullRequestsFor(repository.gitHubRepository),
        this.getPullRequestsFor(repository.gitHubRepository.parent),
      ])
      return [...prs, ...upstreamPrs]
    } else {
      return await this.getPullRequestsFor(repository.gitHubRepository)
    }
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

  /**
   * Get Pull Requests stored in the databse (or cache) for a single GitHubRepository
   *
   * Will query PullRequestStore's database if nothing is cached for that repo.
   */
  private async getPullRequestsFor(
    gitHubRepository: GitHubRepository
  ): Promise<ReadonlyArray<PullRequest>> {
    const { dbID } = gitHubRepository
    // this check should never be true, but we have to check
    // for typescript and provide a sensible fallback
    if (dbID === null) {
      return []
    }

    if (!this.prCache.has(dbID)) {
      this.prCache.set(
        dbID,
        await this.pullRequestStore.getAll(gitHubRepository)
      )
    }
    return this.prCache.get(dbID) || []
  }
}

/**
 * Finds local repositories that depend on a GitHubRepository
 *
 * includes:
 *   * matches: repos with the GitHub repo as its default remote
 *   * forks: repos that are forks of the GitHub repo
 *
 * @param gitHubRepository
 * @param repositories list of repositories to search for a match
 * @returns two lists of repositories: matches and forks
 */
function findRepositoriesForGitHubRepository(
  gitHubRepository: GitHubRepository,
  repositories: ReadonlyArray<RepositoryWithGitHubRepository>
) {
  const { dbID } = gitHubRepository
  const matches = new Array<RepositoryWithGitHubRepository>(),
    forks = new Array<RepositoryWithGitHubRepository>()
  for (const r of repositories) {
    if (r.gitHubRepository.dbID === dbID) {
      matches.push(r)
    } else if (
      r.gitHubRepository.parent !== null &&
      r.gitHubRepository.parent.dbID === dbID
    ) {
      forks.push(r)
    }
  }

  return { matches, forks }
}
