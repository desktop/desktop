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
import { Emitter, Disposable } from 'event-kit'

/** The store for GitHub Pull Requests. */
export class PullRequestStore {
  private readonly emitter = new Emitter()
  private readonly pullRequestDatabase: PullRequestDatabase
  private readonly repositoriesStore: RepositoriesStore

  private activeFetchCountPerRepository = new Map<number, number>()

  public constructor(
    db: PullRequestDatabase,
    repositoriesStore: RepositoriesStore
  ) {
    this.pullRequestDatabase = db
    this.repositoriesStore = repositoriesStore
  }

  /** Loads all pull requests against the given repository. */
  public async refreshPullRequests(
    repository: GitHubRepository,
    account: Account
  ): Promise<void> {
    const api = API.fromAccount(account)

    this.changeActiveFetchCount(repository, c => c + 1)

    try {
      const raw = await api.fetchPullRequests(
        repository.owner.login,
        repository.name,
        'open'
      )

      await this.writePRs(raw, repository)

      const prs = await this.getPullRequests(repository)
      await this.refreshStatusForPRs(prs, repository, account)
    } catch (error) {
      log.warn(`Error refreshing pull requests for '${repository.name}'`, error)
      this.emitError(error)
    } finally {
      this.changeActiveFetchCount(repository, c => c - 1)
    }
  }

  private changeActiveFetchCount(
    repository: GitHubRepository,
    fn: (count: number) => number
  ) {
    const key = forceUnwrap(
      'Cannot fetch PRs for a repository which is not in the database',
      repository.dbID
    )
    const currentCount = this.activeFetchCountPerRepository.get(key) || 0
    const newCount = fn(currentCount)
    this.activeFetchCountPerRepository.set(key, newCount)

    this.emitUpdate(repository)
  }

  /** Is the store currently fetching the list of open pull requests? */
  public isFetchingPullRequests(repository: GitHubRepository): boolean {
    const key = forceUnwrap(
      'Cannot fetch PRs for a repository which is not in the database',
      repository.dbID
    )

    const currentCount = this.activeFetchCountPerRepository.get(key) || 0
    return currentCount > 0
  }

  /** Loads the status for the given pull request. */
  public async refreshSinglePullRequestStatus(
    repository: GitHubRepository,
    account: Account,
    pullRequest: PullRequest
  ): Promise<void> {
    await this.refreshStatusForPRs([pullRequest], repository, account)
  }

  /** Loads the status for all pull request against a given repository. */
  public async refreshPullRequestStatuses(
    repository: GitHubRepository,
    account: Account
  ): Promise<void> {
    const prs = await this.getPullRequests(repository)

    await this.refreshStatusForPRs(prs, repository, account)
  }

  private async refreshStatusForPRs(
    pullRequests: ReadonlyArray<PullRequest>,
    repository: GitHubRepository,
    account: Account
  ): Promise<void> {
    const api = API.fromAccount(account)

    const statuses: Array<IPullRequestStatus> = []
    const prs: Array<PullRequest> = []

    for (const pr of pullRequests) {
      const apiStatus = await api.fetchCombinedRefStatus(
        repository.owner.login,
        repository.name,
        pr.head.sha
      )

      const status = {
        pullRequestNumber: pr.number,
        state: apiStatus.state,
        totalCount: apiStatus.total_count,
        sha: pr.head.sha,
      }

      statuses.push({
        pullRequestId: pr.id,
        state: apiStatus.state,
        totalCount: apiStatus.total_count,
        sha: pr.head.sha,
      })

      prs.push(
        new PullRequest(
          pr.id,
          pr.created,
          status,
          pr.title,
          pr.number,
          pr.head,
          pr.base,
          pr.author
        )
      )
    }

    await this.writePRStatus(statuses)
    this.emitUpdate(repository)
  }

  private async getPRStatusById(
    sha: string,
    pullRequestId: number
  ): Promise<PullRequestStatus | null> {
    const result = await this.pullRequestDatabase.pullRequestStatus
      .where('[sha+pullRequestId]')
      .equals([sha, pullRequestId])
      .limit(1)
      .first()

    if (!result) {
      return null
    }

    return new PullRequestStatus(
      result.pullRequestId,
      result.state,
      result.totalCount,
      result.sha
    )
  }

  private async writePRs(
    pullRequests: ReadonlyArray<IAPIPullRequest>,
    repository: GitHubRepository
  ): Promise<void> {
    const repoId = repository.dbID

    if (!repoId) {
      fatalError(
        "Cannot store pull requests for a repository that hasn't been inserted into the database!"
      )

      return
    }

    const table = this.pullRequestDatabase.pullRequests

    const insertablePRs = new Array<IPullRequest>()
    for (const pr of pullRequests) {
      let headRepo: GitHubRepository | null = null
      if (pr.head.repo) {
        headRepo = await this.repositoriesStore.findOrPutGitHubRepository(
          repository.endpoint,
          pr.head.repo
        )
      }

      // We know the base repo isn't null since that's where we got the PR from
      // in the first place.
      const baseRepo = await this.repositoriesStore.findOrPutGitHubRepository(
        repository.endpoint,
        forceUnwrap('PR cannot have a null base repo', pr.base.repo)
      )

      insertablePRs.push({
        number: pr.number,
        title: pr.title,
        createdAt: pr.created_at,
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
          repoId: headRepo ? headRepo.dbID! : null,
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
          repoId: forceUnwrap('PR cannot have a null base repo', baseRepo.dbID),
        },
        author: pr.user.login,
      })
    }

    await this.pullRequestDatabase.transaction('rw', table, async () => {
      await table.clear()
      return await table.bulkAdd(insertablePRs)
    })
  }

  private async writePRStatus(
    statuses: Array<IPullRequestStatus>
  ): Promise<void> {
    const table = this.pullRequestDatabase.pullRequestStatus

    await this.pullRequestDatabase.transaction('rw', table, async () => {
      for (const status of statuses) {
        const existing = await table
          .where('[sha+pullRequestId]')
          .equals([status.sha, status.pullRequestId])
          .first()
        if (existing) {
          await table.put({ id: existing.id, ...status })
        } else {
          await table.add(status)
        }
      }
    })
  }

  /** Gets the pull requests against the given repository. */
  public async getPullRequests(
    repository: GitHubRepository
  ): Promise<ReadonlyArray<PullRequest>> {
    const gitHubRepositoryID = repository.dbID

    if (!gitHubRepositoryID) {
      return fatalError(
        "Cannot get pull requests for a repository that hasn't been inserted into the database!"
      )
    }

    const raw = await this.pullRequestDatabase.pullRequests
      .where('base.repoId')
      .equals(gitHubRepositoryID)
      .reverse()
      .sortBy('number')

    const pullRequests = new Array<PullRequest>()

    for (const pr of raw) {
      const headId = pr.head.repoId

      let head: GitHubRepository | null = null

      if (headId) {
        head = await this.repositoriesStore.findGitHubRepositoryByID(headId)
      }

      // We know the base repo ID can't be null since it's the repository we
      // fetched the PR from in the first place.
      const baseId = forceUnwrap(
        'PR cannot have a null base repo id',
        pr.base.repoId
      )
      const base = forceUnwrap(
        'PR cannot have a null base repo',
        await this.repositoriesStore.findGitHubRepositoryByID(baseId)
      )

      // We can be certain the PR ID is valid since we just got it from the
      // database.
      const prID = forceUnwrap(
        'PR cannot have a null ID after being retrieved from the database',
        pr.id
      )

      const pullRequestStatus = await this.getPRStatusById(pr.head.sha, prID)

      const pullRequest = new PullRequest(
        prID,
        new Date(pr.createdAt),
        pullRequestStatus,
        pr.title,
        pr.number,
        new PullRequestRef(pr.head.ref, pr.head.sha, head),
        new PullRequestRef(pr.base.ref, pr.base.sha, base),
        pr.author
      )

      pullRequests.push(pullRequest)
    }

    return pullRequests
  }

  private emitUpdate(repository: GitHubRepository) {
    this.emitter.emit('did-update', repository)
  }

  private emitError(error: Error) {
    this.emitter.emit('did-error', error)
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: (repository: GitHubRepository) => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /** Register a function to be called when an error occurs. */
  public onDidError(fn: (error: Error) => void): Disposable {
    return this.emitter.on('did-error', fn)
  }
}
