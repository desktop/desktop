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
 * Provides a single point of access for getting pull requests
 * associated with a local repository (assuming its connected
 * to a repository on GitHub).
 *
 * Primarily a layer between AppStore and the
 * PullRequestStore + PullRequestUpdaters.
 */
export class PullRequestCoordinator {
  /**
   * Currently running PullRequestUpdater (should be for
   * the "selected" repository in `AppStore`)
   */
  private currentPullRequestUpdater: PullRequestUpdater | null = null
  /**
   * All `Repository`s in RepositoryStore associated with `GitHubRepository`
   * This is updated whenever `RepositoryStore` emits an update
   */
  private repositories: ReadonlyArray<
    RepositoryWithGitHubRepository
  > = new Array<RepositoryWithGitHubRepository>()

  /**
   * Contains the last set of PRs retreived by `PullRequestCoordinator`
   * from `PullRequestStore` for a specific `GitHubRepository`.
   * Keyed by `GitHubRepository` database ID to a list of pull requests.
   *
   * This is used to improve perforamnce by reducing
   * duplicate queries to the pull request database.
   *
   */
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

  /**
   * Register a function to be called when the PullRequestStore updates.
   *
   * @param fn to be called with a `Repository` and an updated +
   *           complete list of pull requests whenever `PullRequestStore`
   *           emits an update for a related repo on GitHub.
   *
   * Related repos include:
   *  * the corresponding GitHub repo (the `origin` remote for
   *    the `Repository`)
   *  * the parent GitHub repo, if the `Repository` has one (the
   *    `upstream` remote for the `Repository`)
   *
   */
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

  /**
   * Register a function to be called when PullRequestStore
   * emits a "loading" event.
   *
   * @param fn to be called with a `Repository` whenever
   *           `PullRequestStore` emits an update for a
   *           related repo on GitHub.
   *
   * Related repos include:
   *  * the corresponding GitHub repo (the `origin` remote for
   *    the `Repository`)
   *  * the parent GitHub repo, if the `Repository` has one (the
   *    `upstream` remote for the `Repository`)
   *
   */
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

  /**
   * Fetches all pull requests for the given repository.
   * This **will** attempt to hit the GitHub API.
   */
  public async refreshPullRequests(
    repository: RepositoryWithGitHubRepository,
    account: Account
  ) {
    await this.pullRequestStore.refreshPullRequests(
      repository.gitHubRepository,
      account
    )
    if (repository.gitHubRepository.parent !== null) {
      await this.pullRequestStore.refreshPullRequests(
        repository.gitHubRepository.parent,
        account
      )
    }
  }

  /**
   * Get the last time a repository's pull requests were fetched
   * from the GitHub API
   *
   * Since `PullRequestStore` stores these timestamps by
   * `GitHubRepository`, we get timestamps for this
   * repo's `GitHubRepository` and its parent (if it has one)
   * and return the _older one._
   *
   * If neither timestamp is stored, returns `undefined`
   */
  public getLastRefreshed(
    repository: RepositoryWithGitHubRepository
  ): number | undefined {
    const ghr = repository.gitHubRepository
    const lastRefresh = this.pullRequestStore.getLastRefreshed(ghr)

    const parentLastRefresh = ghr.parent
      ? this.pullRequestStore.getLastRefreshed(ghr.parent)
      : undefined

    return !lastRefresh || !parentLastRefresh
      ? lastRefresh || parentLastRefresh
      : Math.min(lastRefresh, parentLastRefresh)
  }

  /**
   * Get all Pull Requests that are stored locally for the given Repository
   * (Doesn't load anything new from the GitHub API.)
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

  /** Start background pull request fetching machinery for this Repository */
  public startPullRequestUpdater(
    repository: RepositoryWithGitHubRepository,
    account: Account
  ) {
    if (this.currentPullRequestUpdater !== null) {
      this.stopPullRequestUpdater()
    }

    this.currentPullRequestUpdater = new PullRequestUpdater(
      repository,
      account,
      this
    )
    this.currentPullRequestUpdater.start()
  }

  /** Stop background pull request fetching machinery for this Repository */
  public stopPullRequestUpdater() {
    if (this.currentPullRequestUpdater !== null) {
      this.currentPullRequestUpdater.stop()
      this.currentPullRequestUpdater = null
    }
  }

  /**
   * Get Pull Requests stored in the database (or
   * `PullRequestCoordinator`'s cache) for a single `GitHubRepository`)
   *
   * Will query `PullRequestStore`'s database if nothing is cached for that repo.
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
 * Finds local repositories related to a GitHubRepository
 *
 * * Related repos include:
 *  * **matches** — the corresponding GitHub repo (the `origin` remote for
 *    the `Repository`)
 *  * **forks** — the parent GitHub repo, if the `Repository` has one (the
 *    `upstream` remote for the `Repository`)
 *
 * @param gitHubRepository
 * @param repositories list of repositories to search for a match
 * @returns two lists of repositories: **matches** and **forks**
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
