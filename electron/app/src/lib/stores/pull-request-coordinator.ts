import { Account } from '../../models/account'
import { PullRequest } from '../../models/pull-request'
import {
  RepositoryWithGitHubRepository,
  isRepositoryWithGitHubRepository,
  getNonForkGitHubRepository,
} from '../../models/repository'
import { PullRequestStore } from '.'
import { PullRequestUpdater } from './helpers/pull-request-updater'
import { RepositoriesStore } from './repositories-store'
import { GitHubRepository } from '../../models/github-repository'
import { Disposable, Emitter } from 'event-kit'

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
  private repositories: Promise<ReadonlyArray<RepositoryWithGitHubRepository>>

  /**
   * Contains the last set of PRs retrieved by `PullRequestCoordinator`
   * from `PullRequestStore` for a specific `GitHubRepository`.
   * Keyed by `GitHubRepository` database ID to a list of pull requests.
   *
   * This is used to improve performance by reducing
   * duplicate queries to the pull request database.
   *
   */
  private readonly prCache = new Map<number, ReadonlyArray<PullRequest>>()

  /** Used to emit pull request loading events */
  protected readonly emitter = new Emitter()

  public constructor(
    private readonly pullRequestStore: PullRequestStore,
    private readonly repositoriesStore: RepositoriesStore
  ) {
    // register an update handler for the repositories store
    this.repositoriesStore.onDidUpdate(allRepositories => {
      this.repositories = Promise.resolve(
        allRepositories.filter(isRepositoryWithGitHubRepository)
      )
    })

    // The `onDidUpdate` event only triggers when the list of repositories
    // changes or a repository's information is changed. This may now happen for
    // a very long time so we need to eagerly load the list of repositories.
    this.repositories = this.repositoriesStore
      .getAll()
      .then(x => x.filter(isRepositoryWithGitHubRepository))
      .catch(e => {
        log.error(`PullRequestCoordinator: Error loading repositories`, e)
        return []
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
   */
  public onPullRequestsChanged(
    fn: (
      repository: RepositoryWithGitHubRepository,
      pullRequests: ReadonlyArray<PullRequest>
    ) => void
  ): Disposable {
    return this.pullRequestStore.onPullRequestsChanged(
      async (ghRepo, pullRequests) => {
        this.prCache.set(ghRepo.dbID, pullRequests)

        // find all related repos
        const matches = findRepositoriesForGitHubRepository(
          ghRepo,
          await this.repositories
        )

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
   */
  public onIsLoadingPullRequests(
    fn: (
      repository: RepositoryWithGitHubRepository,
      isLoadingPullRequests: boolean
    ) => void
  ): Disposable {
    return this.emitter.on('onIsLoadingPullRequest', value => {
      const { repository, isLoadingPullRequests } = value
      fn(repository, isLoadingPullRequests)
    })
  }

  /**
   * Fetches all pull requests for the given repository.
   * This **will** attempt to hit the GitHub API.
   *
   * This method has some specific logic for emitting loading
   * events. Multiple clones of the same remote GitHub repo
   * will share the same fields in the pull request database,
   * but the larger app considers every local copy separate.
   * The `findRepositoriesForGitHubRepository` logic ensures
   * that we emit loading events for all those repositories.
   */
  public async refreshPullRequests(
    repository: RepositoryWithGitHubRepository,
    account: Account
  ) {
    const gitHubRepository = getNonForkGitHubRepository(repository)

    // get all matches for the repository to be refreshed
    const matches = findRepositoriesForGitHubRepository(
      gitHubRepository,
      await this.repositories
    )
    // mark all matching repos as now loading
    for (const match of matches) {
      this.emitIsLoadingPullRequests(match, true)
    }

    await this.pullRequestStore.refreshPullRequests(gitHubRepository, account)

    // mark all matching repos as done loading
    for (const match of matches) {
      this.emitIsLoadingPullRequests(match, false)
    }
  }

  /**
   * Get the last time a repository's pull requests were fetched
   * from the GitHub API
   *
   * Since `PullRequestStore` stores these timestamps by
   * `GitHubRepository`, we get timestamps for this
   * repo's `GitHubRepository` or its parent (if it has one).
   *
   * If no timestamp is stored, returns `undefined`
   */
  public getLastRefreshed(
    repository: RepositoryWithGitHubRepository
  ): number | undefined {
    const ghr = getNonForkGitHubRepository(repository)

    return this.pullRequestStore.getLastRefreshed(ghr)
  }

  /**
   * Get all Pull Requests that are stored locally for the given Repository
   * (Doesn't load anything new from the GitHub API.)
   */
  public async getAllPullRequests(
    repository: RepositoryWithGitHubRepository
  ): Promise<ReadonlyArray<PullRequest>> {
    return this.getPullRequestsFor(getNonForkGitHubRepository(repository))
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

  /** Emits a "pull requests are loading" event */
  private emitIsLoadingPullRequests(
    repository: RepositoryWithGitHubRepository,
    isLoadingPullRequests: boolean
  ) {
    this.emitter.emit('onIsLoadingPullRequest', {
      repository,
      isLoadingPullRequests,
    })
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
    if (!this.prCache.has(gitHubRepository.dbID)) {
      this.prCache.set(
        gitHubRepository.dbID,
        await this.pullRequestStore.getAll(gitHubRepository)
      )
    }
    return this.prCache.get(gitHubRepository.dbID) || []
  }
}

/**
 * Finds local repositories related to a GitHubRepository
 *
 * * Related repos include the corresponding GitHub repo (the `origin` remote for
 *    the `Repository`) or the parent GitHub repo, if the `Repository` has one (the
 *    `upstream` remote for the `Repository`)
 *
 * @param gitHubRepository
 * @param repositories list of repositories to search for a match
 * @returns the list of repositories.
 */
function findRepositoriesForGitHubRepository(
  gitHubRepository: GitHubRepository,
  repositories: ReadonlyArray<RepositoryWithGitHubRepository>
): ReadonlyArray<RepositoryWithGitHubRepository> {
  const { dbID } = gitHubRepository

  return repositories.filter(
    repository => getNonForkGitHubRepository(repository).dbID === dbID
  )
}
