import { IssuesDatabase, IIssue } from '../databases/issues-database'
import { API, IAPIIssue } from '../api'
import { Account } from '../../models/account'
import { GitHubRepository } from '../../models/github-repository'
import { fatalError } from '../fatal-error'

/** The hard limit on the number of issue results we'd ever return. */
const IssueResultsHardLimit = 100

/** The store for GitHub issues. */
export class IssuesStore {
  private db: IssuesDatabase

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
    const gitHubRepositoryID = repository.dbID
    if (!gitHubRepositoryID) {
      return fatalError(
        "Cannot get issues for a repository that hasn't been inserted into the database!"
      )
    }

    const db = this.db

    const latestUpdatedIssue = await db.issues
      .where('[gitHubRepositoryID+updated_at]')
      .between([gitHubRepositoryID], [gitHubRepositoryID + 1], true, false)
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
    const gitHubRepositoryID = repository.dbID
    if (!gitHubRepositoryID) {
      fatalError(
        `Cannot store issues for a repository that hasn't been inserted into the database!`
      )
      return
    }

    const issuesToDelete = issues.filter(i => i.state === 'closed')
    const issuesToUpsert = issues
      .filter(i => i.state === 'open')
      .map<IIssue>(i => {
        return {
          gitHubRepositoryID,
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
          gitHubRepositoryID,
          issue.number
        )
        if (existing) {
          await this.db.issues.delete(existing.id!)
        }
      }

      for (const issue of issuesToUpsert) {
        const existing = await findIssueInRepositoryByNumber(
          gitHubRepositoryID,
          issue.number
        )
        if (existing) {
          await db.issues.update(existing.id!, issue)
        } else {
          await db.issues.add(issue)
        }
      }
    })
  }

  /** Get issues whose title or number matches the text. */
  public async getIssuesMatching(
    repository: GitHubRepository,
    text: string
  ): Promise<ReadonlyArray<IIssue>> {
    const gitHubRepositoryID = repository.dbID
    if (!gitHubRepositoryID) {
      fatalError(
        "Cannot get issues for a repository that hasn't been inserted into the database!"
      )
      return []
    }

    if (!text.length) {
      const issues = await this.db.issues
        .where('gitHubRepositoryID')
        .equals(gitHubRepositoryID)
        .limit(IssueResultsHardLimit)
        .reverse()
        .sortBy('number')
      return issues
    }

    const MaxScore = 1
    const score = (i: IIssue) => {
      if (i.number.toString().startsWith(text)) {
        return MaxScore
      }

      if (i.title.toLowerCase().includes(text.toLowerCase())) {
        return MaxScore - 0.1
      }

      return 0
    }

    const issuesCollection = await this.db.issues
      .where('gitHubRepositoryID')
      .equals(gitHubRepositoryID)
      .filter(i => score(i) > 0)

    const issues = await issuesCollection.limit(IssueResultsHardLimit).toArray()

    return issues.sort((a, b) => score(b) - score(a))
  }
}
