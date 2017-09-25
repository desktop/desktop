import { PullRequestDatabase } from '../databases'
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

  public async fetchPullRequests(
    repository: GitHubRepository,
    account: Account
  ) {
    const api = API.fromAccount(account)

    const prs = await api.fetchPullRequests(
      repository.owner.login,
      repository.name,
      'open'
    )

    this.writePullRequests(prs, repository)
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

    const prTable = this.db.pullRequests
    const dbPRs = await prTable.toArray()
    const apiPRs = pullRequests as Array<IAPIPullRequest>
    const sorterdDbPRs = dbPRs.sort()
    const sortedApiPRs = apiPRs.sort()
    const itemsToDelete: Array<number> = []

    //Take the relative complement of A and B where B is the db and A is pullRequests argument
    for (let i = 0; i < sorterdDbPRs.length; i++) {
      if (sortedApiPRs[i].number !== sorterdDbPRs[i].number) {
        itemsToDelete.push(sorterdDbPRs[i].number)
      }
    }

    function findPullRequestByNumber(
      repositoryId: number,
      pullRequestNumber: number
    ) {
      return prTable
        .where('[repo_id+number]')
        .equals([repositoryId, pullRequestNumber])
        .limit(1)
        .first()
    }

    await this.db.transaction('rw', prTable, function*() {
      for (const pullRequestNumber of itemsToDelete) {
        const prToDelete = yield findPullRequestByNumber(
          repoId,
          pullRequestNumber
        )

        if (prToDelete) {
          yield prTable.delete(prToDelete.id)
        }
      }
    })
  }
}
