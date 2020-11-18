import mem from 'mem'

import {
  PullRequestDatabase,
  IPullRequest,
  PullRequestKey,
  getPullRequestKey,
} from '../databases/pull-request-database'
import { GitHubRepository } from '../../models/github-repository'
import { Account } from '../../models/account'
import { API, IAPIPullRequest, MaxResultsError } from '../api'
import { fatalError } from '../fatal-error'
import { RepositoriesStore } from './repositories-store'
import { PullRequest, PullRequestRef } from '../../models/pull-request'
import { structuralEquals } from '../equality'
import { Emitter, Disposable } from 'event-kit'
import { APIError } from '../http'

/** The store for GitHub Pull Requests. */
export class PullRequestStore {
  protected readonly emitter = new Emitter()
  private readonly currentRefreshOperations = new Map<number, Promise<void>>()
  private readonly lastRefreshForRepository = new Map<number, number>()

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

  /** Loads all pull requests against the given repository. */
  public refreshPullRequests(repo: GitHubRepository, account: Account) {
    const currentOp = this.currentRefreshOperations.get(repo.dbID)

    if (currentOp !== undefined) {
      return currentOp
    }

    this.lastRefreshForRepository.set(repo.dbID, Date.now())

    const promise = this.fetchAndStorePullRequests(repo, account)
      .catch(err => {
        log.error(`Error refreshing pull requests for '${repo.fullName}'`, err)
      })
      .then(() => {
        this.currentRefreshOperations.delete(repo.dbID)
      })

    this.currentRefreshOperations.set(repo.dbID, promise)
    return promise
  }

  /**
   * Fetches pull requests from the API (either all open PRs if it's the
   * first time fetching for this repository or all updated PRs if not).
   *
   * Returns a value indicating whether it's safe to avoid
   * emitting an event that the store has been updated. In other words, when
   * this method returns false it's safe to say that nothing has been changed
   * in the pull requests table.
   */
  private async fetchAndStorePullRequests(
    repo: GitHubRepository,
    account: Account
  ) {
    const api = API.fromAccount(account)
    const lastUpdatedAt = await this.db.getLastUpdated(repo)

    // If we don't have a lastUpdatedAt that mean we haven't fetched any PRs
    // for the repository yet which in turn means we only have to fetch the
    // currently open PRs. If we have fetched before we get all PRs
    // If we have a lastUpdatedAt that mean we have fetched PRs
    // for the repository before. If we have fetched before we get all PRs
    // that have been modified since the last time we fetched so that we
    // can prune closed issues from our database. Note that since
    // `api.fetchUpdatedPullRequests` returns all issues modified _at_ or
    // after the timestamp we give it we will always get at least one issue
    // back. See `storePullRequests` for details on how that's handled.
    if (!lastUpdatedAt) {
      return this.fetchAndStoreOpenPullRequests(api, repo)
    } else {
      return this.fetchAndStoreUpdatedPullRequests(api, repo, lastUpdatedAt)
    }
  }

  private async fetchAndStoreOpenPullRequests(
    api: API,
    repository: GitHubRepository
  ) {
    const { name, owner } = getNameWithOwner(repository)
    const open = await api.fetchAllOpenPullRequests(owner, name)
    await this.storePullRequestsAndEmitUpdate(open, repository)
  }

  private async fetchAndStoreUpdatedPullRequests(
    api: API,
    repository: GitHubRepository,
    lastUpdatedAt: Date
  ) {
    const { name, owner } = getNameWithOwner(repository)
    const updated = await api
      .fetchUpdatedPullRequests(owner, name, lastUpdatedAt)
      .catch(e =>
        // Any other error we'll bubble up but these ones we
        // can handle, see below.
        e instanceof MaxResultsError || e instanceof APIError
          ? Promise.resolve(null)
          : Promise.reject(e)
      )

    if (updated !== null) {
      return await this.storePullRequestsAndEmitUpdate(updated, repository)
    } else {
      // If we fail to load updated pull requests either because
      // there's too many updated PRs since the last time we
      // fetched (and it's likely that it'll be much more
      // efficient to just load the open PRs) or it's because the
      // API told us we couldn't load PRs (rate limit or permissions
      // problems). In either case we delete the PRs we've got
      // for this repo and attempt to load just the open ones.
      //
      // This scenario can happen for repositories that are
      // very active while simultaneously infrequently used
      // by the user. Think of a very active open source repository
      // where the user only visits once a year to make a contribution.
      // It's likely that there's at most a few hundred PRs open but
      // the number of merged PRs since the last time we fetched could
      // number in the thousands.
      await this.db.deleteAllPullRequestsInRepository(repository)
      await this.fetchAndStoreOpenPullRequests(api, repository)
    }
  }

  public getLastRefreshed(repository: GitHubRepository) {
    return repository.dbID
      ? this.lastRefreshForRepository.get(repository.dbID)
      : undefined
  }

  /** Gets all stored pull requests for the given repository. */
  public async getAll(repository: GitHubRepository) {
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
    const store = this.repositoryStore
    const getRepo = mem(store.findGitHubRepositoryByID.bind(store))

    for (const record of records) {
      const headRepository = await getRepo(record.head.repoId)
      const baseRepository = await getRepo(record.base.repoId)

      if (headRepository === null) {
        return fatalError("head repository can't be null")
      }

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
          record.author,
          record.draft ?? false
        )
      )
    }

    // Reversing the results in place manually instead of using
    // .reverse on the IndexedDB query has been measured to have favorable
    // performance characteristics for repositories with a lot of pull
    // requests since it means Dexie is able to leverage the IndexedDB
    // getAll method as opposed to creating a reverse cursor. Reversing
    // in place versus unshifting is also dramatically more performant.
    return result.reverse()
  }

  /**
   * Stores all pull requests that are open and deletes all that are merged
   * or closed. Returns a value indicating whether an update notification
   * has been emitted, see `storePullRequests` for more details.
   */
  private async storePullRequestsAndEmitUpdate(
    pullRequestsFromAPI: ReadonlyArray<IAPIPullRequest>,
    repository: GitHubRepository
  ) {
    if (await this.storePullRequests(pullRequestsFromAPI, repository)) {
      this.emitPullRequestsChanged(repository, await this.getAll(repository))
    }
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

    let mostRecentlyUpdated = pullRequestsFromAPI[0].updated_at

    const prsToDelete = new Array<PullRequestKey>()
    const prsToUpsert = new Array<IPullRequest>()

    // The API endpoint for this PR, i.e api.github.com or a GHE url
    const { endpoint } = repository
    const store = this.repositoryStore

    // Upsert will always query the database for a repository. Given that
    // we've receive these repositories in a batch response from the API
    // it's pretty unlikely that they'd differ between PRs so we're going
    // to use the upsert just to ensure that the repo exists in the database
    // and reuse the same object without going to the database for all that
    // follow.
    const upsertRepo = mem(store.upsertGitHubRepositoryLight.bind(store), {
      // The first argument which we're ignoring here is the endpoint
      // which is constant throughout the lifetime of this function.
      // The second argument is an `IAPIRepository` which is basically
      // the raw object that we got from the API which could consist of
      // more than just the fields we've modelled in the interface. The
      // only thing we really care about to determine whether the
      // repository has already been inserted in the database is the clone
      // url since that's what the upsert method uses as its key.
      cacheKey: (_, repo) => repo.clone_url,
    })

    for (const pr of pullRequestsFromAPI) {
      // We can do this string comparison here rather than convert to date
      // because ISO8601 is lexicographically sortable
      if (pr.updated_at > mostRecentlyUpdated) {
        mostRecentlyUpdated = pr.updated_at
      }

      // We know the base repo isn't null since that's where we got the PR from
      // in the first place.
      if (pr.base.repo === null) {
        return fatalError('PR cannot have a null base repo')
      }

      const baseGitHubRepo = await upsertRepo(endpoint, pr.base.repo)

      if (pr.state === 'closed') {
        prsToDelete.push(getPullRequestKey(baseGitHubRepo, pr.number))
        continue
      }

      // `pr.head.repo` represents the source of the pull request. It might be
      // a branch associated with the current repository, or a fork of the
      // current repository.
      //
      // In cases where the user has removed the fork of the repository after
      // opening a pull request, this can be `null`, and the app will not store
      // this pull request.
      if (pr.head.repo == null) {
        log.debug(
          `Unable to store pull request #${pr.number} for repository ${repository.fullName} as it has no head repository associated with it`
        )
        prsToDelete.push(getPullRequestKey(baseGitHubRepo, pr.number))
        continue
      }

      const headRepo = await upsertRepo(endpoint, pr.head.repo)

      prsToUpsert.push({
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
        draft: pr.draft ?? false,
      })
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

    await this.db.transaction(
      'rw',
      this.db.pullRequests,
      this.db.pullRequestsLastUpdated,
      async () => {
        await this.db.deletePullRequests(prsToDelete)
        await this.db.putPullRequests(prsToUpsert)
        await this.db.setLastUpdated(repository, new Date(mostRecentlyUpdated))
      }
    )

    return true
  }
}

function getNameWithOwner(repository: GitHubRepository) {
  const owner = repository.owner.login
  const name = repository.name
  return { name, owner }
}
