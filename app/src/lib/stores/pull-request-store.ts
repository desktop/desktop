import { PullRequestDatabase } from '../databases'
import { GitHubRepository } from '../../models/github-repository'
import { API, IAPIPullRequest } from '../api'

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

    const pullRequests = await api.fetchPullRequests(
      repository.owner.login,
      '',
      'open'
    )
  }
}
