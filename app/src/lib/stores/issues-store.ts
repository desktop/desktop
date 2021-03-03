import { IssuesDatabase, IIssue } from '../databases/issues-database'
import { API, IAPIIssue } from '../api'
import { Account } from '../../models/account'
import { GitHubRepository } from '../../models/github-repository'
import { compare, compareDescending } from '../compare'
import { DefaultMaxHits } from '../../ui/autocompletion/common'

/** An autocompletion hit for an issue. */
export interface IIssueHit {
  /** The title of the issue. */
  readonly title: string

  /** The issue's number. */
  readonly number: number
}

/**
 * The max time (in milliseconds) that we'll keep a mentionable query
 * cache around before pruning it.
 */
const QueryCacheTimeout = 60 * 1000

interface IQueryCache {
  readonly repository: GitHubRepository
  readonly issues: ReadonlyArray<IIssueHit>
}

/** The store for GitHub issues. */
export class IssuesStore {
  private db: IssuesDatabase
  private queryCache: IQueryCache | null = null
  private pruneQueryCacheTimeoutId: number | null = null

  /** Initialize the store with the given database. */
  public constructor(db: IssuesDatabase) {
    this.db = db
  }

  /**
   * Get the highest value of the 'updated_at' field for issues in a given
   * repository. This value is used to request delta updates from the API
   * using the 'since' parameter.
   */
  private async getLatestUpdatedAt(
    repository: GitHubRepository
  ): Promise<Date | null> {
    const db = this.db

    const latestUpdatedIssue = await db.issues
      .where('[gitHubRepositoryID+updated_at]')
      .between([repository.dbID], [repository.dbID + 1], true, false)
      .last()

    if (!latestUpdatedIssue || !latestUpdatedIssue.updated_at) {
      return null
    }

    const lastUpdatedAt = new Date(latestUpdatedIssue.updated_at)

    return !isNaN(lastUpdatedAt.getTime()) ? lastUpdatedAt : null
  }

  /**
   * Refresh the issues for the current repository. This will delete any issues that have
   * been closed and update or add any issues that have changed or been added.
   */
  public async refreshIssues(repository: GitHubRepository, account: Account) {
    const api = API.fromAccount(account)
    const lastUpdatedAt = await this.getLatestUpdatedAt(repository)

    // If we don't have a lastUpdatedAt that mean we haven't fetched any issues
    // for the repository yet which in turn means we only have to fetch the
    // currently open issues. If we have fetched before we get all issues
    // that have been modified since the last time we fetched so that we
    // can prune closed issues from our database. Note that since the GitHub
    // API returns all issues modified _at_ or after the timestamp we give it
    // we will always get at least one issue back but we won't have to transfer
    // it since we should get a 304 response from GitHub.
    const state = lastUpdatedAt ? 'all' : 'open'

    const issues = await api.fetchIssues(
      repository.owner.login,
      repository.name,
      state,
      lastUpdatedAt
    )

    this.storeIssues(issues, repository)
  }

  private async storeIssues(
    issues: ReadonlyArray<IAPIIssue>,
    repository: GitHubRepository
  ): Promise<void> {
    const issuesToDelete = issues.filter(i => i.state === 'closed')
    const issuesToUpsert = issues
      .filter(i => i.state === 'open')
      .map<IIssue>(i => {
        return {
          gitHubRepositoryID: repository.dbID,
          number: i.number,
          title: i.title,
          updated_at: i.updated_at,
        }
      })

    const db = this.db

    function findIssueInRepositoryByNumber(
      gitHubRepositoryID: number,
      issueNumber: number
    ) {
      return db.issues
        .where('[gitHubRepositoryID+number]')
        .equals([gitHubRepositoryID, issueNumber])
        .limit(1)
        .first()
    }

    await this.db.transaction('rw', this.db.issues, async () => {
      for (const issue of issuesToDelete) {
        const existing = await findIssueInRepositoryByNumber(
          repository.dbID,
          issue.number
        )
        if (existing) {
          await this.db.issues.delete(existing.id!)
        }
      }

      for (const issue of issuesToUpsert) {
        const existing = await findIssueInRepositoryByNumber(
          repository.dbID,
          issue.number
        )
        if (existing) {
          await db.issues.update(existing.id!, issue)
        } else {
          await db.issues.add(issue)
        }
      }
    })

    if (this.queryCache?.repository.dbID === repository.dbID) {
      this.queryCache = null
      this.clearCachePruneTimeout()
    }
  }

  private async getAllIssueHitsFor(repository: GitHubRepository) {
    const hits = await this.db.getIssuesForRepository(repository.dbID)
    return hits.map(i => ({ number: i.number, title: i.title }))
  }

  /** Get issues whose title or number matches the text. */
  public async getIssuesMatching(
    repository: GitHubRepository,
    text: string,
    maxHits = DefaultMaxHits
  ): Promise<ReadonlyArray<IIssueHit>> {
    const issues =
      this.queryCache?.repository.dbID === repository.dbID
        ? // Dexie gets confused if we return without wrapping in promise
          await Promise.resolve(this.queryCache?.issues)
        : await this.getAllIssueHitsFor(repository)

    this.setQueryCache(repository, issues)

    if (!text.length) {
      return issues
        .slice()
        .sort((x, y) => compareDescending(x.number, y.number))
        .slice(0, maxHits)
    }

    const hits = []
    const needle = text.toLowerCase()

    for (const issue of issues) {
      const ix = `${issue.number} ${issue.title}`
        .trim()
        .toLowerCase()
        .indexOf(needle)

      if (ix >= 0) {
        hits.push({ hit: { number: issue.number, title: issue.title }, ix })
      }
    }

    // Sort hits primarily based on how early in the text the match
    // was found and then secondarily using alphabetic order.
    return hits
      .sort((x, y) => compare(x.ix, y.ix) || compare(x.hit.title, y.hit.title))
      .slice(0, maxHits)
      .map(h => h.hit)
  }

  private setQueryCache(
    repository: GitHubRepository,
    issues: ReadonlyArray<IIssueHit>
  ) {
    this.clearCachePruneTimeout()
    this.queryCache = { repository, issues }
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
