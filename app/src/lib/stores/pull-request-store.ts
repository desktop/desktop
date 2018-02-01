import {
  PullRequestDatabase,
  IPullRequest,
  IPullRequestStatus,
} from '../databases'
import { GitHubRepository } from '../../models/github-repository'
import { Account } from '../../models/account'
import { API, IAPIPullRequest } from '../api'
import { fatalError, forceUnwrap } from '../fatal-error'
import { RepositoriesStore } from './repositories-store'
import {
  PullRequest,
  PullRequestRef,
  PullRequestStatus,
} from '../../models/pull-request'
import { TypedBaseStore } from './base-store'
import { Repository } from '../../models/repository'
import { getRemotes, removeRemote } from '../git'
import { IRemote } from '../../models/remote'

/**
 * This is the magic remote name prefix
 * for when we add a remote on behalf of
 * the user.
 */
export const ForkedRemotePrefix = 'github-desktop-'

const Decrement = (n: number) => n - 1
const Increment = (n: number) => n + 1

/** The store for GitHub Pull Requests. */
export class PullRequestStore extends TypedBaseStore<GitHubRepository> {
  private readonly _pullRequestDatabase: PullRequestDatabase
  private readonly _repositoryStore: RepositoriesStore
  private readonly _activeFetchCountPerRepository = new Map<number, number>()

  public constructor(
    db: PullRequestDatabase,
    repositoriesStore: RepositoriesStore
  ) {
    super()

    this._pullRequestDatabase = db
    this._repositoryStore = repositoriesStore
  }

  /** Loads all pull requests against the given repository. */
  public async fetchPullRequests(
    repository: Repository,
    account: Account
  ): Promise<void> {
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
        'open'
      )

      await this.cachePullRequests(apiResult, githubRepo)

      const prs = await this.fetchPullRequestsFromCache(githubRepo)

      await this.refreshStatusForPRs(prs, githubRepo, account)
      await this.pruneForkedRemotes(repository, prs)

      this.emitUpdate(githubRepo)
    } catch (error) {
      log.warn(`Error refreshing pull requests for '${repository.name}'`, error)
      this.emitError(error)
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
    const currentCount = this._activeFetchCountPerRepository.get(repoDbId) || 0

    return currentCount > 0
  }

  /** Loads the status for the given pull request. */
  public async fetchPullRequestStatus(
    repository: GitHubRepository,
    account: Account,
    pullRequest: PullRequest
  ): Promise<void> {
    await this.refreshStatusForPRs([pullRequest], repository, account)
  }

  /** Loads the status for all pull request against a given repository. */
  public async fetchPullRequestStatuses(
    repository: GitHubRepository,
    account: Account
  ): Promise<void> {
    const prs = await this.fetchPullRequestsFromCache(repository)

    await this.refreshStatusForPRs(prs, repository, account)
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

    const records = await this._pullRequestDatabase.pullRequests
      .where('base.repoId')
      .equals(gitHubRepositoryID)
      .reverse()
      .sortBy('number')

    const result = new Array<PullRequest>()

    for (const record of records) {
      const repositoryDbId = record.head.repoId
      let githubRepository: GitHubRepository | null = null

      if (repositoryDbId != null) {
        githubRepository = await this._repositoryStore.findGitHubRepositoryByID(
          repositoryDbId
        )
      }

      // We know the base repo ID can't be null since it's the repository we
      // fetched the PR from in the first place.
      const parentRepositoryDbId = forceUnwrap(
        'A pull request cannot have a null base repo id',
        record.base.repoId
      )
      const parentGitGubRepository: GitHubRepository | null = await this._repositoryStore.findGitHubRepositoryByID(
        parentRepositoryDbId
      )
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

      const pullRequestStatus = await this.findPullRequestStatus(
        record.head.sha,
        pullRequestDbId
      )

      result.push(
        new PullRequest(
          pullRequestDbId,
          new Date(record.createdAt),
          pullRequestStatus,
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
    const forkedRemotesToDelete = this.getRemotesToDelete(remotes, pullRequests)

    await this.deleteRemotes(repository, forkedRemotesToDelete)
  }

  private getRemotesToDelete(
    remotes: ReadonlyArray<IRemote>,
    openPullRequests: ReadonlyArray<PullRequest>
  ): ReadonlyArray<IRemote> {
    const forkedRemotes = remotes.filter(remote =>
      remote.name.startsWith(ForkedRemotePrefix)
    )
    const remotesOfPullRequests = new Set<string>()

    openPullRequests.forEach(pr => {
      const { gitHubRepository } = pr.head

      if (gitHubRepository != null && gitHubRepository.cloneURL != null) {
        remotesOfPullRequests.add(gitHubRepository.cloneURL)
      }
    })

    const result = forkedRemotes.filter(
      forkedRemote => !remotesOfPullRequests.has(forkedRemote.url)
    )

    return result
  }

  private async deleteRemotes(
    repository: Repository,
    remotes: ReadonlyArray<IRemote>
  ) {
    const promises: Array<Promise<void>> = []

    remotes.forEach(r => promises.push(removeRemote(repository, r.name)))
    await Promise.all(promises)
  }

  private updateActiveFetchCount(
    repository: GitHubRepository,
    update: (count: number) => number
  ) {
    const repoDbId = forceUnwrap(
      'Cannot fetch PRs for a repository which is not in the database',
      repository.dbID
    )
    const currentCount = this._activeFetchCountPerRepository.get(repoDbId) || 0
    const newCount = update(currentCount)

    this._activeFetchCountPerRepository.set(repoDbId, newCount)
    this.emitUpdate(repository)
  }

  private async refreshStatusForPRs(
    pullRequests: ReadonlyArray<PullRequest>,
    repository: GitHubRepository,
    account: Account
  ): Promise<void> {
    const apiClient = API.fromAccount(account)
    const statuses: Array<IPullRequestStatus> = []

    for (const pr of pullRequests) {
      const combinedRefStatus = await apiClient.fetchCombinedRefStatus(
        repository.owner.login,
        repository.name,
        pr.head.sha
      )

      statuses.push({
        pullRequestId: pr.id,
        state: combinedRefStatus.state,
        totalCount: combinedRefStatus.total_count,
        sha: pr.head.sha,
        statuses: combinedRefStatus.statuses,
      })
    }

    await this.cachePullRequestStatuses(statuses)
    this.emitUpdate(repository)
  }

  private async findPullRequestStatus(
    sha: string,
    pullRequestId: number
  ): Promise<PullRequestStatus | null> {
    const result = await this._pullRequestDatabase.pullRequestStatus
      .where('[sha+pullRequestId]')
      .equals([sha, pullRequestId])
      .limit(1)
      .first()

    if (!result) {
      return null
    }

    const combinedRefStatuses = (result.statuses || []).map(x => {
      return {
        id: x.id,
        state: x.state,
      }
    })

    return new PullRequestStatus(
      result.pullRequestId,
      result.state,
      result.totalCount,
      result.sha,
      combinedRefStatuses
    )
  }

  private async cachePullRequests(
    apiuPullRequestsFrom: ReadonlyArray<IAPIPullRequest>,
    repository: GitHubRepository
  ): Promise<void> {
    const repoDbId = repository.dbID

    if (repoDbId == null) {
      return fatalError(
        "Cannot store pull requests for a repository that hasn't been inserted into the database!"
      )
    }

    const table = this._pullRequestDatabase.pullRequests
    const prsToInsert = new Array<IPullRequest>()
    let githubRepo: GitHubRepository | null = null

    for (const pr of apiuPullRequestsFrom) {
      // Once the repo is found on first try, no need to keep looking
      if (githubRepo == null && pr.head.repo != null) {
        githubRepo = await this._repositoryStore.upsertGitHubRepository(
          repository.endpoint,
          pr.head.repo
        )
      }

      if (githubRepo == null) {
        return fatalError(
          "The PR doesn't seem to be associated with a GitHub repository"
        )
      }

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
      const parentGitHubRepo = await this._repositoryStore.upsertGitHubRepository(
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

    return this._pullRequestDatabase.transaction('rw', table, async () => {
      await table
        .where('base.repoId')
        .equals(prsToInsert[0].base.repoId!)
        .delete()

      await table.bulkAdd(prsToInsert)
    })
  }

  private async cachePullRequestStatuses(
    statuses: Array<IPullRequestStatus>
  ): Promise<void> {
    const table = this._pullRequestDatabase.pullRequestStatus

    await this._pullRequestDatabase.transaction('rw', table, async () => {
      for (const status of statuses) {
        const record = await table
          .where('[sha+pullRequestId]')
          .equals([status.sha, status.pullRequestId])
          .first()

        if (record == null) {
          await table.add(status)
        } else {
          await table.put({ id: record.id, ...status })
        }
      }
    })
  }
}
