import { GitHubRepository } from '../../models/github-repository'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { API } from '../api'
import { AccountsStore } from './accounts-store'
//import { NotificationsStore } from './notifications-store'
import { PullRequestCoordinator } from './pull-request-coordinator'

export class NotificationsDebugStore {
  public constructor(
    private readonly accountsStore: AccountsStore,
    //private readonly notificationsStore: NotificationsStore,
    private readonly pullRequestCoordinator: PullRequestCoordinator
  ) {
    //this.aliveStore.onAliveEventReceived(this.onAliveEventReceived)
  }

  private async getAccountForRepository(repository: GitHubRepository) {
    const { endpoint } = repository

    const accounts = await this.accountsStore.getAll()
    return accounts.find(a => a.endpoint === endpoint) ?? null
  }

  private async getAPIForRepository(repository: GitHubRepository) {
    const account = await this.getAccountForRepository(repository)

    if (account === null) {
      return null
    }

    return API.fromAccount(account)
  }

  public async getPullRequests(repository: RepositoryWithGitHubRepository) {
    return this.pullRequestCoordinator.getAllPullRequests(repository)
  }

  public async getPullRequestReviews(
    repository: RepositoryWithGitHubRepository,
    pullRequestNumber: number
  ) {
    const api = await this.getAPIForRepository(repository.gitHubRepository)
    if (api === null) {
      return []
    }

    const ghRepository = repository.gitHubRepository

    return api.fetchPullRequestReviews(
      ghRepository.owner.login,
      ghRepository.name,
      pullRequestNumber.toString()
    )
  }

  public async getPullRequestComments(
    repository: RepositoryWithGitHubRepository,
    pullRequestNumber: number
  ) {
    const api = await this.getAPIForRepository(repository.gitHubRepository)
    if (api === null) {
      return []
    }

    const ghRepository = repository.gitHubRepository

    const issueComments = await api.fetchPullRequestComments(
      ghRepository.owner.login,
      ghRepository.name,
      pullRequestNumber.toString()
    )

    // Fetch review comments of type COMMENTED and with no body
    const allReviews = await api.fetchPullRequestReviews(
      ghRepository.owner.login,
      ghRepository.name,
      pullRequestNumber.toString()
    )

    const commentedReviewsWithNoBody = allReviews.filter(
      review => review.state === 'COMMENTED' && !review.body
    )

    const allReviewComments = await Promise.all(
      commentedReviewsWithNoBody.map(review =>
        api.fetchPullRequestReviewComments(
          ghRepository.owner.login,
          ghRepository.name,
          pullRequestNumber.toString(),
          review.id.toString()
        )
      )
    )

    const singleReviewComments = allReviewComments.flatMap(comments =>
      comments.length === 1 ? comments : []
    )

    return [...issueComments, ...singleReviewComments]
  }
}
