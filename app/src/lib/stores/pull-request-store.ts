import { PullRequestDatabase, IPullRequest } from '../databases'
import { GitHubRepository } from '../../models/github-repository'
import { Account } from '../../models/account'
import { API, IAPIPullRequest } from '../api'
import { fatalError } from '../fatal-error'
import { RepositoriesStore } from './repositories-store'
import { PullRequest } from '../../models/pull-request'

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

  public async updatePullRequests(
    repository: GitHubRepository,
    account: Account
  ): Promise<ReadonlyArray<PullRequest>> {
    const api = API.fromAccount(account)

    const prs = await api.fetchPullRequests(
      repository.owner.login,
      repository.name,
      'open'
    )

    await this.writePullRequests(prs, repository)

    return this.getPullRequests(repository)
  }

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
      .where('repo_id')
      .equals(gitHubRepositoryID)
      .sortBy('number')

    return pullRequests.map(
      x =>
        new PullRequest(
          new Date(x.createdAt),
          null,
          x.title,
          x.number,
          x.head,
          x.base
        )
    )
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
      const headRepo = await this.repositoriesStore.findOrPutGitHubRepository(
        repository.endpoint,
        pr.head.repo
      )

      const baseRepo = await this.repositoriesStore.findOrPutGitHubRepository(
        repository.endpoint,
        pr.base.repo
      )

      insertablePRs.push({
        number: pr.number,
        title: pr.title,
        createdAt: pr.created_at,
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
          repoId: headRepo.dbID!,
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
          repoId: baseRepo.dbID!,
        },
      })
    }

    await this.db.transaction('rw', table, async () => {
      await table.clear()
      await table.bulkAdd(insertablePRs)
    })
  }
}
