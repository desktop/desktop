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

/** The store for GitHub Pull Requests. */
export class PullRequestStore {
  private readonly db: PullRequestDatabase
  private readonly repositoriesStore: RepositoriesStore

  public constructor(
    db: PullRequestDatabase,
    repositoriesStore: RepositoriesStore
  ) {
    this.db = db
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

    const prs = await this.getPullRequests(repository)
    const pullRequestsStatuses: Array<IPullRequestStatus> = []

    for (const pr of prs) {
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

    return await this.getPullRequests(repository)
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
      const prStatus = await this.getPullRequestStatusById(pr.head.sha, prID)

      const builtPR = new PullRequest(
        prID,
        new Date(pr.createdAt),
        prStatus,
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

  private async writePullRequests(
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

    const table = this.db.pullRequests

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

    await this.db.transaction('rw', table, async () => {
      await table.clear()
      await table.bulkAdd(insertablePRs)
    })
  }

  private async getPullRequestStatusById(
    sha: string,
    pullRequestId: number
  ): Promise<PullRequestStatus | null> {
    const result = await this.db.pullRequestStatus
      .where('[sha+pullRequestId]')
      .equals([sha, pullRequestId])
      .limit(1)
      .first()

    if (!result) {
      return null
    }

    return new PullRequestStatus(result.state, result.totalCount, result.sha)
  }

  private async writePullRequestStatus(
    statuses: Array<IPullRequestStatus>
  ): Promise<void> {
    await this.db.pullRequestStatus.bulkAdd(statuses)
  }
}
