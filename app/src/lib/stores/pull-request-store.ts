import { PullRequestDatabase, IPullRequest } from '../databases'
import { GitHubRepository } from '../../models/github-repository'
import { Account } from '../../models/account'
import { API, IAPIPullRequest } from '../api'
import { fatalError, forceUnwrap } from '../fatal-error'
import { RepositoriesStore } from './repositories-store'
import { PullRequest, PullRequestRef } from '../../models/pull-request'
import { TypedBaseStore } from './base-store'
import { Repository } from '../../models/repository'
import { getRemotes, removeRemote } from '../git'
import { ForkedRemotePrefix } from '../../models/remote'

const Decrement = (n: number) => n - 1
const Increment = (n: number) => n + 1

/** The store for GitHub Pull Requests. */
export class PullRequestStore extends TypedBaseStore<GitHubRepository> {
  private readonly pullRequestDatabase: PullRequestDatabase
  private readonly repositoryStore: RepositoriesStore
  private readonly activeFetchCountPerRepository = new Map<number, number>()

  public constructor(
    db: PullRequestDatabase,
    repositoriesStore: RepositoriesStore
  ) {
    super()

    this.pullRequestDatabase = db
    this.repositoryStore = repositoriesStore
  }

  /** Loads all pull requests against the given repository. */
  public async refreshPullRequests(repository: Repository, account: Account) {
    const githubRepo = forceUnwrap(
      'Can only refresh pull requests for GitHub repositories',
      repository.gitHubRepository
    )
    const apiClient = API.fromAccount(account)

    this.updateActiveFetchCount(githubRepo, Increment)

    try {
      const apiResult = await apiClient.fetchPullRequests(
        githubRepo.owner.login,
        githubRepo.name,
        'open',
        null
      )

      await this.cachePullRequests(apiResult, githubRepo)

      const prs = await this.fetchPullRequestsFromCache(githubRepo)

      await this.pruneForkedRemotes(repository, prs)

      this.emitUpdate(githubRepo)
    } catch (error) {
      log.warn(`Error refreshing pull requests for '${repository.name}'`, error)
    } finally {
      this.updateActiveFetchCount(githubRepo, Decrement)
    }
  }

  /** Is the store currently fetching the list of open pull requests? */
  public isFetchingPullRequests(repository: GitHubRepository): boolean {
    const repoDbId = forceUnwrap(
      'Cannot fetch PRs for a repository which is not in the database',
      repository.dbID
    )
    const currentCount = this.activeFetchCountPerRepository.get(repoDbId) || 0

    return currentCount > 0
  }

  /** Gets the pull requests against the given repository. */
  public async fetchPullRequestsFromCache(
    repository: GitHubRepository
  ): Promise<ReadonlyArray<PullRequest>> {
    const gitHubRepositoryID = repository.dbID

    if (gitHubRepositoryID == null) {
      return fatalError(
        "Cannot get pull requests for a repository that hasn't been inserted into the database!"
      )
    }

    const records = await this.pullRequestDatabase.pullRequests
      .where('base.repoId')
      .equals(gitHubRepositoryID)
      .reverse()
      .sortBy('number')

    const result = new Array<PullRequest>()

    // In order to avoid what would otherwise be a very expensive
    // N+1 (N+2 really) query where we look up the head and base
    // GitHubRepository from IndexedDB for each pull request we'll store
    // already retrieved GitHubRepository instances in this map and seed
    // it with the repository provided to us when initiating the load(which,
    // for most cases will be the only thing we'll need unless the repository
    // contains PRs from forks). Adding this optimization decreased the
    // run time of this method from 6 seconds to just under 26 ms while
    // testing using a large internal repository. Even in the worst-case
    // scenario (i.e a repository with a very large number of open PRs, all
    // originating from forks) this will reduce the N+2 to N+1.
    const repoCache = new Map<number, GitHubRepository | null>()
    repoCache.set(gitHubRepositoryID, repository)

    for (const record of records) {
      const repositoryDbId = record.head.repoId
      let githubRepository: GitHubRepository | null | undefined = null

      if (repositoryDbId != null) {
        githubRepository = repoCache.get(repositoryDbId) || null
        if (githubRepository === undefined) {
          githubRepository = await this.repositoryStore.findGitHubRepositoryByID(
            repositoryDbId
          )
          repoCache.set(repositoryDbId, githubRepository)
        }
      }

      // We know the base repo ID can't be null since it's the repository we
      // fetched the PR from in the first place.
      const parentRepositoryDbId = forceUnwrap(
        'A pull request cannot have a null base repo id',
        record.base.repoId
      )
      let parentGitGubRepository:
        | GitHubRepository
        | undefined
        | null = repoCache.get(parentRepositoryDbId)

      if (parentGitGubRepository === undefined) {
        parentGitGubRepository = await this.repositoryStore.findGitHubRepositoryByID(
          parentRepositoryDbId
        )
        repoCache.set(parentRepositoryDbId, parentGitGubRepository)
      }

      const parentGitHubRepository = forceUnwrap(
        'PR cannot have a null base repo',
        parentGitGubRepository
      )

      // We can be certain the PR ID is valid since we just got it from the
      // database.
      const pullRequestDbId = forceUnwrap(
        'PR cannot have a null ID after being retrieved from the database',
        record.id
      )

      result.push(
        new PullRequest(
          pullRequestDbId,
          new Date(record.createdAt),
          record.title,
          record.number,
          new PullRequestRef(
            record.head.ref,
            record.head.sha,
            githubRepository
          ),
          new PullRequestRef(
            record.base.ref,
            record.base.sha,
            parentGitHubRepository
          ),
          record.author
        )
      )
    }

    return result
  }

  private async pruneForkedRemotes(
    repository: Repository,
    pullRequests: ReadonlyArray<PullRequest>
  ) {
    const remotes = await getRemotes(repository)
    const prRemotes = new Set<string>()

    for (const pr of pullRequests) {
      const prRepo = pr.head.gitHubRepository

      if (prRepo !== null && prRepo.cloneURL !== null) {
        prRemotes.add(prRepo.cloneURL)
      }
    }

    for (const r of remotes) {
      if (r.name.startsWith(ForkedRemotePrefix) && !prRemotes.has(r.url)) {
        await removeRemote(repository, r.name)
      }
    }
  }

  private updateActiveFetchCount(
    repository: GitHubRepository,
    update: (count: number) => number
  ) {
    const repoDbId = forceUnwrap(
      'Cannot fetch PRs for a repository which is not in the database',
      repository.dbID
    )
    const currentCount = this.activeFetchCountPerRepository.get(repoDbId) || 0
    const newCount = update(currentCount)

    this.activeFetchCountPerRepository.set(repoDbId, newCount)
    this.emitUpdate(repository)
  }

  private async cachePullRequests(
    pullRequestsFromAPI: ReadonlyArray<IAPIPullRequest>,
    repository: GitHubRepository
  ): Promise<void> {
    const repoDbId = repository.dbID

    if (repoDbId == null) {
      return fatalError(
        "Cannot store pull requests for a repository that hasn't been inserted into the database!"
      )
    }

    const table = this.pullRequestDatabase.pullRequests
    const prsToInsert = new Array<IPullRequest>()

    for (const pr of pullRequestsFromAPI) {
      // `pr.head.repo` represents the source of the pull request. It might be
      // a branch associated with the current repository, or a fork of the
      // current repository.
      //
      // In cases where the user has removed the fork of the repository after
      // opening a pull request, this can be `null`, and the app will not store
      // this pull request.

      if (pr.head.repo == null) {
        log.debug(
          `Unable to store pull request #${pr.number} for repository ${
            repository.fullName
          } as it has no head repository associated with it`
        )
        continue
      }

      const githubRepo = await this.repositoryStore.upsertGitHubRepository(
        repository.endpoint,
        pr.head.repo
      )

      const githubRepoDbId = forceUnwrap(
        'PR cannot have non-existent repo',
        githubRepo.dbID
      )

      // We know the base repo isn't null since that's where we got the PR from
      // in the first place.
      const parentRepo = forceUnwrap(
        'PR cannot have a null base repo',
        pr.base.repo
      )
      const parentGitHubRepo = await this.repositoryStore.upsertGitHubRepository(
        repository.endpoint,
        parentRepo
      )
      const parentGitHubRepoDbId = forceUnwrap(
        'PR cannot have a null parent database id',
        parentGitHubRepo.dbID
      )

      prsToInsert.push({
        number: pr.number,
        title: pr.title,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
          repoId: githubRepoDbId,
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
          repoId: parentGitHubRepoDbId,
        },
        author: pr.user.login,
      })
    }

    return this.pullRequestDatabase.transaction('rw', table, async () => {
      // we need to delete the stales PRs from the db
      // so we remove all for a repo to avoid having to
      // do diffing
      await table
        .where('base.repoId')
        .equals(repoDbId)
        .delete()

      if (prsToInsert.length > 0) {
        await table.bulkAdd(prsToInsert)
      }
    })
  }
}
