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

  public constructor(
    db: PullRequestDatabase,
    repositoriesStore: RepositoriesStore
  ) {
    this.pullRequestDatabase = db
    this.repositoriesStore = repositoriesStore
  }

  /** Update the list of open pull requests for the repository. */
  public async refreshPullRequests(
    repository: GitHubRepository,
    account: Account
  ): Promise<ReadonlyArray<PullRequest>> {
    const api = API.fromAccount(account)

    const prsFromAPI = await api.fetchPullRequests(
      repository.owner.login,
      repository.name,
      'open'
    )

    await this.writePullRequests(prsFromAPI, repository)

    const results = await this.getPullRequests(repository)

    await this.refreshStatusesForPullRequests(results, repository, account)

    return await this.getPullRequests(repository)
  }

  public async refreshSinglePullRequestStatus(
    repository: GitHubRepository,
    account: Account,
    pullRequest: PullRequest
  ): Promise<PullRequestStatus> {
    const results = await this.refreshStatusesForPullRequests(
      [pullRequest],
      repository,
      account
    )
    return results[0]
  }

  public async refreshPullRequestStatuses(
    repository: GitHubRepository,
    account: Account
  ): Promise<ReadonlyArray<PullRequestStatus>> {
    const prs = await this.getPullRequests(repository)

    return await this.refreshStatusesForPullRequests(prs, repository, account)
  }

  public async refreshStatusesForPullRequests(
    pullRequests: ReadonlyArray<PullRequest>,
    repository: GitHubRepository,
    account: Account
  ): Promise<ReadonlyArray<PullRequestStatus>> {
    const api = API.fromAccount(account)

    const pullRequestsStatuses: Array<IPullRequestStatus> = []

    for (const pr of pullRequests) {
      const status = await api.fetchCombinedRefStatus(
        repository.owner.login,
        repository.name,
        pr.head.sha
      )

      pullRequestsStatuses.push({
        state: status.state,
        totalCount: status.total_count,
        pullRequestId: pr.id,
        sha: pr.head.sha,
      })
    }

    await this.writePullRequestStatus(pullRequestsStatuses)

    return await this.getPullRequestStatuses(pullRequests, repository)
  }

  /** Get the pull request statuses from the database */
  public async getPullRequestStatuses(
    pullReqeuests: ReadonlyArray<PullRequest>,
    repository: GitHubRepository
  ): Promise<ReadonlyArray<PullRequestStatus>> {
    const gitHubRepositoryID = repository.dbID

    if (!gitHubRepositoryID) {
      fatalError(
        "Cannot get pull requests for a repository that hasn't been inserted into the database!"
      )

      return []
    }

    const result: Array<PullRequestStatus> = []
    const prs = await this.getPullRequests(repository)

    for (const pr of prs) {
      const status = await this.getPullRequestStatusById(pr.head.sha, pr.id)

      if (!status) {
        continue
      }

      result.push(
        new PullRequestStatus(
          pr.number,
          status.state,
          status.totalCount,
          status.sha
        )
      )
    }

    return result
  }

  /** Get the pull requests from the database. */
  public async getPullRequests(
    repository: GitHubRepository
  ): Promise<ReadonlyArray<PullRequest>> {
    const gitHubRepositoryID = repository.dbID
    if (!gitHubRepositoryID) {
      fatalError(
        "Cannot get pull requests for a repository that hasn't been inserted into the database!"
      )

      return []
    }

    const pullRequests = await this.db.pullRequests
      .where('base.repoId')
      .equals(gitHubRepositoryID)
      .reverse()
      .sortBy('number')

    const builtPullRequests = new Array<PullRequest>()
    for (const pr of pullRequests) {
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

      const pullRequestStatus = await this.getPullRequestStatusById(
        pr.head.sha,
        prID
      )

      const builtPR = new PullRequest(
        prID,
        new Date(pr.createdAt),
        pullRequestStatus,
        pr.title,
        pr.number,
        new PullRequestRef(pr.head.ref, pr.head.sha, head),
        new PullRequestRef(pr.base.ref, pr.base.sha, base),
        pr.author
      )

      builtPullRequests.push(builtPR)
    }

    return builtPullRequests
  }

  private async getPullRequestStatusById(
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

  private async writePullRequests(
    pullRequests: ReadonlyArray<IAPIPullRequest>,
    repository: GitHubRepository
  ): Promise<number> {
    const repoId = repository.dbID

    if (!repoId) {
      fatalError(
        "Cannot store pull requests for a repository that hasn't been inserted into the database!"
      )

      return -1
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

    return await this.pullRequestDatabase.transaction('rw', table, async () => {
      await table.clear()
      return await table.bulkAdd(insertablePRs)
    })
  }

  private async writePullRequestStatus(
    statuses: Array<IPullRequestStatus>
  ): Promise<void> {
    const table = this.pullRequestDatabase.pullRequestStatus

    return await this.pullRequestDatabase.transaction('rw', table, async () => {
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
  private emitUpdate() {
    this.emitter.emit('did-update', {})
  }

  private emitError(error: Error) {
    this.emitter.emit('did-error', error)
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /** Register a function to be called when an error occurs. */
  public onDidError(fn: (error: Error) => void): Disposable {
    return this.emitter.on('did-error', fn)
  }
}
