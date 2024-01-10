import { Account } from '../../models/account'
import { GitHubRepository } from '../../models/github-repository'
import { API } from '../api'
import {
  GitHubUserDatabase,
  IMentionableUser,
} from '../databases/github-user-database'

import { compare } from '../compare'
import { BaseStore } from './base-store'
import { getStealthEmailForUser, getLegacyStealthEmailForUser } from '../email'
import { DefaultMaxHits } from '../../ui/autocompletion/common'

/** Don't fetch mentionables more often than every 10 minutes */
const MaxFetchFrequency = 10 * 60 * 1000

/**
 * The max time (in milliseconds) that we'll keep a mentionable query
 * cache around before pruning it.
 */
const QueryCacheTimeout = 60 * 1000

interface IQueryCache {
  readonly repository: GitHubRepository
  readonly users: ReadonlyArray<IMentionableUser>
}

/**
 * The store for GitHub users. This is used to match commit authors to GitHub
 * users and avatars.
 */
export class GitHubUserStore extends BaseStore {
  private queryCache: IQueryCache | null = null
  private pruneQueryCacheTimeoutId: number | null = null

  public constructor(private readonly database: GitHubUserDatabase) {
    super()
  }

  /**
   * Retrieve a public user profile from the API based on the
   * user login.
   *
   * @param account The account to use when querying the API
   *                for information about the user
   * @param login   The login (i.e. handle) of the user
   */
  public async getByLogin(
    account: Account,
    login: string
  ): Promise<IMentionableUser | null> {
    const api = API.fromAccount(account)
    const apiUser = await api.fetchUser(login).catch(e => null)

    if (!apiUser || apiUser.type !== 'User') {
      return null
    }

    const email =
      apiUser.email !== null && apiUser.email.length > 0
        ? apiUser.email
        : getStealthEmailForUser(apiUser.id, login, account.endpoint)

    return {
      avatarURL: apiUser.avatar_url,
      email,
      name: apiUser.name || apiUser.login,
      login: apiUser.login,
    }
  }

  /** Update the mentionable users for the repository. */
  public async updateMentionables(
    repository: GitHubRepository,
    account: Account
  ): Promise<void> {
    const api = API.fromAccount(account)

    const cacheEntry = await this.database.getMentionableCacheEntry(
      repository.dbID
    )

    if (
      cacheEntry !== undefined &&
      Date.now() - cacheEntry.lastUpdated < MaxFetchFrequency
    ) {
      return
    }

    const response = await api.fetchMentionables(
      repository.owner.login,
      repository.name,
      cacheEntry?.eTag
    )

    if (response === null) {
      await this.database.touchMentionableCacheEntry(
        repository.dbID,
        cacheEntry?.eTag
      )
      return
    }

    const { endpoint } = account

    const mentionables = response.users.map(u => {
      const { name, login, avatar_url: avatarURL } = u
      const email = u.email || getLegacyStealthEmailForUser(login, endpoint)
      return { name, login, email, avatarURL }
    })

    await this.database.updateMentionablesForRepository(
      repository.dbID,
      mentionables,
      response.etag
    )

    if (this.queryCache?.repository.dbID === repository.dbID) {
      this.queryCache = null
      this.clearCachePruneTimeout()
    }
  }

  /** Get the mentionable users in the repository. */
  public async getMentionableUsers(
    repository: GitHubRepository
  ): Promise<ReadonlyArray<IMentionableUser>> {
    return this.database.getAllMentionablesForRepository(repository.dbID)
  }

  /**
   * Get the mentionable users which match the text in some way.
   *
   * Hit results are ordered by how close in the search string
   * they matched. Search strings start with username and are followed
   * by real name. Only the first substring hit is considered
   *
   * @param repository The GitHubRepository for which to look up
   *                   mentionables.
   *
   * @param text    A string to use when looking for a matching
   *                user. A user is considered a hit if this text
   *                matches any subtext of the username or real name
   *
   * @param maxHits The maximum number of hits to return.
   */
  public async getMentionableUsersMatching(
    repository: GitHubRepository,
    query: string,
    maxHits: number = DefaultMaxHits
  ): Promise<ReadonlyArray<IMentionableUser>> {
    const users =
      this.queryCache?.repository.dbID === repository.dbID
        ? this.queryCache.users
        : await this.getMentionableUsers(repository)

    this.setQueryCache(repository, users)

    const hits = []
    const needle = query.toLowerCase()

    // Simple substring comparison on login and real name
    for (const user of users) {
      const ix = `${user.login} ${user.name}`
        .trim()
        .toLowerCase()
        .indexOf(needle)

      if (ix >= 0) {
        hits.push({ user, ix })
      }
    }

    // Sort hits primarily based on how early in the text the match
    // was found and then secondarily using alphabetic order. Ideally
    // we'd use the GitHub user id in order to match dotcom behavior
    // but sadly we don't have it handy here. The id property on IGitHubUser
    // refers to our internal database id.
    return hits
      .sort(
        (x, y) => compare(x.ix, y.ix) || compare(x.user.login, y.user.login)
      )
      .slice(0, maxHits)
      .map(h => h.user)
  }

  private setQueryCache(
    repository: GitHubRepository,
    users: ReadonlyArray<IMentionableUser>
  ) {
    this.clearCachePruneTimeout()
    this.queryCache = { repository, users }
    this.pruneQueryCacheTimeoutId = window.setTimeout(() => {
      this.pruneQueryCacheTimeoutId = null
      this.queryCache = null
    }, QueryCacheTimeout)
  }

  private clearCachePruneTimeout() {
    if (this.pruneQueryCacheTimeoutId !== null) {
      clearTimeout(this.pruneQueryCacheTimeoutId)
      this.pruneQueryCacheTimeoutId = null
    }
  }
}
