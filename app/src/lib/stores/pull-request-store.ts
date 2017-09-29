import { PullRequestDatabase, IPullRequest } from '../databases'
import { GitHubRepository } from '../../models/github-repository'
import { Account } from '../../models/account'
import { API, IAPIPullRequest } from '../api'
import { fatalError } from '../fatal-error'

/** The store for GitHub Pull Requests. */
export class PullRequestStore {
  private db: PullRequestDatabase

  public constructor(db: PullRequestDatabase) {
    this.db = db
  }

  public async cachePullRequests(
    repository: GitHubRepository,
    account: Account
  ) {
    const api = API.fromAccount(account)

    const prs = await api.fetchPullRequests(
      repository.owner.login,
      repository.name,
      'open'
    )

    await this.writePullRequests(prs, repository)
  }

  public async getPullRequests(repository: GitHubRepository) {
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

    return pullRequests
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
    const insertablePRs: Array<IPullRequest> = pullRequests.map(x => {
      return {
        number: x.number,
        title: x.title,
        createdAt: x.created_at,
        head: {
          ref: x.head.ref,
          sha: x.head.sha,
          repoId: -1,
        },
        base: {
          ref: x.base.ref,
          sha: x.base.sha,
          repoId: -1,
        },
      }
    })

    await this.db.transaction('rw', table, async () => {
      await table.clear()
      await table.bulkAdd(insertablePRs)
    })
  }
}
