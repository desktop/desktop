import mem from 'mem'

import { PullRequestDatabase, IPullRequest } from '../databases'
import { GitHubRepository } from '../../models/github-repository'
import { Account } from '../../models/account'
import { API, IAPIPullRequest } from '../api'
import { fatalError, forceUnwrap } from '../fatal-error'
import { RepositoriesStore } from './repositories-store'
import { PullRequest, PullRequestRef } from '../../models/pull-request'
import { structuralEquals } from '../equality'
import { Emitter, Disposable } from 'event-kit'

const Decrement = (n: number) => n - 1
const Increment = (n: number) => n + 1

/** The store for GitHub Pull Requests. */
export class PullRequestStore {
  protected readonly emitter = new Emitter()
  private readonly activeFetchCountPerRepository = new Map<number, number>()

  public constructor(
    private readonly db: PullRequestDatabase,
    private readonly repositoryStore: RepositoriesStore
  ) {}

  private emitPullRequestsChanged(
    repository: GitHubRepository,
    pullRequests: ReadonlyArray<PullRequest>
  ) {
    this.emitter.emit('onPullRequestsChanged', { repository, pullRequests })
  }

  /** Register a function to be called when the store updates. */
  public onPullRequestsChanged(
    fn: (
      repository: GitHubRepository,
      pullRequests: ReadonlyArray<PullRequest>
    ) => void
  ): Disposable {
    return this.emitter.on('onPullRequestsChanged', value => {
      const { repository, pullRequests } = value
      fn(repository, pullRequests)
    })
  }

  private emitIsLoadingPullRequests(
    repository: GitHubRepository,
    isLoadingPullRequests: boolean
  ) {
    this.emitter.emit('onIsLoadingPullRequest', {
      repository,
      isLoadingPullRequests,
    })
  }

  /** Register a function to be called when the store updates. */
  public onIsLoadingPullRequests(
    fn: (repository: GitHubRepository, isLoadingPullRequests: boolean) => void
  ): Disposable {
    return this.emitter.on('onIsLoadingPullRequest', value => {
      const { repository, isLoadingPullRequests } = value
      fn(repository, isLoadingPullRequests)
    })
  }

  /** Loads all pull requests against the given repository. */
  public async refreshPullRequests(repo: GitHubRepository, account: Account) {
    this.updateActiveFetchCount(repo, Increment)

    const lastUpdatedAt = await this.db.getLastUpdated(repo)

    const api = API.fromAccount(account)
    const owner = repo.owner.login
    const name = repo.name

    try {
      // If we don't have a lastUpdatedAt that mean we haven't fetched any PRs
      // for the repository yet which in turn means we only have to fetch the
      // currently open PRs. If we have fetched before we get all PRs
      // that have been modified since the last time we fetched so that we
      // can prune closed issues from our database. Note that since
      // fetchPullRequestsUpdatedSince returns all issues modified _at_ or
      // after the timestamp we give it we will always get at least one issue
      // back.
      const apiResult = lastUpdatedAt
        ? await api.fetchUpdatedPullRequests(owner, name, lastUpdatedAt)
        : await api.fetchAllOpenPullRequests(owner, name)

      if (await this.storePullRequests(apiResult, repo)) {
        this.emitPullRequestsChanged(repo, await this.getAll(repo))
      }
    } catch (err) {
      log.warn(`Error refreshing pull requests for '${owner}/${name}'`, err)
    } finally {
      this.updateActiveFetchCount(repo, Decrement)
    }
  }

  /** Gets all stored pull requests for the given repository. */
  public async getAll(repository: GitHubRepository) {
    if (repository.dbID == null) {
      return fatalError("Can't fetch PRs for repository, no dbId")
    }

    const records = await this.db.getAllPullRequestsInRepository(repository)
    const result = new Array<PullRequest>()

    // In order to avoid what would otherwise be a very expensive
    // N+1 (N+2 really) query where we look up the head and base
    // GitHubRepository from IndexedDB for each pull request we'll memoize
    // already retrieved GitHubRepository instances.
    //
    // This optimization decreased the run time of this method from 6
    // seconds to just under 26 ms while testing using an internal
    // repository with 1k+ PRs. Even in the worst-case scenario (i.e
    // a repository with a huge number of open PRs from forks) this
    // will reduce the N+2 to N+1.
    const getRepo = mem((id: number) =>
      this.repositoryStore.findGitHubRepositoryByID(id)
    )

    for (const record of records) {
      const headRepository = record.head.repoId
        ? await getRepo(record.head.repoId)
        : null
      const baseRepository = await getRepo(record.base.repoId)

      if (baseRepository === null) {
        return fatalError("base repository can't be null")
      }

      result.push(
        new PullRequest(
          new Date(record.createdAt),
          record.title,
          record.number,
          new PullRequestRef(record.head.ref, record.head.sha, headRepository),
          new PullRequestRef(record.base.ref, record.base.sha, baseRepository),
          record.author
        )
      )
    }

    // Reversing the results in place manually instead of using
    // .reverse on the IndexedDB query has measured to have favorable
    // performance characteristics for repositories with a lot of pull
    // requests since it means Dexie is able to leverage the IndexedDB
    // getAll method as opposed to creating a reverse cursor. Reversing
    // in place versus unshifting is also dramatically more performant.
    return result.reverse()
  }

  private updateActiveFetchCount(
    repository: GitHubRepository,
    update: (count: number) => number
  ) {
    const repoDbId = forceUnwrap(
      'Cannot fetch PRs for a repository which is not in the database',
      repository.dbID
    )
    const currentCount = this.activeFetchCountPerRepository.get(repoDbId) || 0
    const newCount = update(currentCount)

    this.activeFetchCountPerRepository.set(repoDbId, newCount)
    this.emitIsLoadingPullRequests(repository, newCount > 0)
  }

  /**
   * Stores all pull requests that are open and deletes all that are merged
   * or closed. Returns a value indicating whether it's safe to avoid
   * emitting an event that the store has been updated. In other words, when
   * this method returns false it's safe to say that nothing has been changed
   * in the pull requests table.
   */
  private async storePullRequests(
    pullRequestsFromAPI: ReadonlyArray<IAPIPullRequest>,
    repository: GitHubRepository
  ) {
    if (pullRequestsFromAPI.length === 0) {
      return false
    }

    const prsToDelete = new Array<IPullRequest>()
    const prsToUpsert = new Array<IPullRequest>()

    // The API endpoint for this PR, i.e api.github.com or a GHE url
    const { endpoint } = repository

    for (const pr of pullRequestsFromAPI) {
      // `pr.head.repo` represents the source of the pull request. It might be
      // a branch associated with the current repository, or a fork of the
      // current repository.
      //
      // In cases where the user has removed the fork of the repository after
      // opening a pull request, this can be `null`, and the app will not store
      // this pull request.
      if (pr.head.repo == null) {
        log.debug(
          `Unable to store pull request #${pr.number} for repository ${
            repository.fullName
          } as it has no head repository associated with it`
        )
        continue
      }

      const headRepo = await this.repositoryStore.upsertGitHubRepository(
        endpoint,
        pr.head.repo
      )

      if (headRepo.dbID === null) {
        return fatalError('PR cannot have non-existent repo')
      }

      // We know the base repo isn't null since that's where we got the PR from
      // in the first place.
      if (pr.base.repo === null) {
        return fatalError('PR cannot have a null base repo')
      }

      const baseGitHubRepo = await this.repositoryStore.upsertGitHubRepository(
        endpoint,
        pr.base.repo
      )

      if (baseGitHubRepo.dbID === null) {
        return fatalError('PR cannot have a null parent database id')
      }

      const dbPr: IPullRequest = {
        number: pr.number,
        title: pr.title,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
          repoId: headRepo.dbID,
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
          repoId: baseGitHubRepo.dbID,
        },
        author: pr.user.login,
      }

      if (pr.state === 'closed' || pr.state === 'merged') {
        prsToDelete.push(dbPr)
      } else {
        prsToUpsert.push(dbPr)
      }
    }

    // When loading only PRs that has changed since the last fetch
    // we get back all PRs modified _at_ or after the timestamp we give it
    // meaning we will always get at least one issue back but. This
    // check detect this particular condition and lets us avoid expensive
    // branch pruning and updates for a single PR that hasn't actually
    // been updated.
    if (prsToDelete.length === 0 && prsToUpsert.length === 1) {
      const cur = prsToUpsert[0]
      const prev = await this.db.getPullRequest(repository, cur.number)

      if (prev !== undefined && structuralEquals(cur, prev)) {
        return false
      }
    }

    await this.db.transaction('rw', this.db.pullRequests, async () => {
      await this.db.deletePullRequests(prsToDelete)
      await this.db.putPullRequests(prsToUpsert)
    })

    return true
  }
}
