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
        const { clones, forks } = findRepositoriesForGitHubRepository(
          ghRepo,
          this.repositories
        )
        this.getForkPrs(forks).then(forksWithPrs => {
          for (const [fork, prs] of forksWithPrs) {
            fn(fork, [...prs, ...pullRequests])
          }
        })
        for (const c of clones) {
          fn(c, pullRequests)
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
        const { clones, forks } = findRepositoriesForGitHubRepository(
          ghRepo,
          this.repositories
        )
        for (const repo of [...clones, ...forks]) {
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
        this.pullRequestStore.getAll(repository.gitHubRepository),
        this.pullRequestStore.getAll(repository.gitHubRepository.parent),
      ])
      return [...prs, ...upstreamPrs]
    } else {
      return await this.pullRequestStore.getAll(repository.gitHubRepository)
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
   * Gets currently stored pull requests from PullRequestStore for each fork
   *
   * Uses a cache internally to reduce database calls in PullRequestStore.
   *
   * @param forks list of forks
   * @returns map of forks to a list of prs
   */
  private async getForkPrs(
    forks: ReadonlyArray<RepositoryWithGitHubRepository>
  ): Promise<Map<RepositoryWithGitHubRepository, ReadonlyArray<PullRequest>>> {
    const prCache = new Map<number, ReadonlyArray<PullRequest>>()
    const forksWithPrs = new Map<
      RepositoryWithGitHubRepository,
      ReadonlyArray<PullRequest>
    >()
    for (const f of forks) {
      const { dbID } = f.gitHubRepository
      // this check should never be false, but we have to check for `tsc`
      if (dbID !== null) {
        if (!prCache.has(dbID)) {
          prCache.set(
            dbID,
            await this.pullRequestStore.getAll(f.gitHubRepository)
          )
        }
        forksWithPrs.set(f, prCache.get(dbID) || [])
      }
    }
    return forksWithPrs
  }
}

/**
 * Helper for matching a GitHubRepository to its local clone
 * and fork Repositories
 *
 * @param gitHubRepository
 * @param repositories list of repositories to search for a match
 * @returns two lists of repositories: direct clones and forks
 */
function findRepositoriesForGitHubRepository(
  gitHubRepository: GitHubRepository,
  repositories: ReadonlyArray<RepositoryWithGitHubRepository>
) {
  const { dbID } = gitHubRepository
  const clones = new Array<RepositoryWithGitHubRepository>(),
    forks = new Array<RepositoryWithGitHubRepository>()
  for (const r of repositories) {
    if (r.gitHubRepository.dbID === dbID) {
      clones.push(r)
    } else if (
      r.gitHubRepository.parent !== null &&
      r.gitHubRepository.parent.dbID === dbID
    ) {
      forks.push(r)
    }
  }

  return { clones, forks }
}
