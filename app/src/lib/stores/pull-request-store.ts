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

  public async fetchPullRequests(repository: GitHubRepository, account: Account) {
    const api = API.fromAccount(account)

    const prs = await api.fetchPullRequests(repository.owner.login, repository.name, 'open')

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
    }

    const db = this.db

    //Diff database or overwrite from API
  }
}
