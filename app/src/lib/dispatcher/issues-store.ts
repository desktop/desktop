import { IssuesDatabase, IIssue } from './issues-database'
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

  private async getLatestUpdatedAt(repository: GitHubRepository): Promise<string | null> {
    const gitHubRepositoryID = repository.dbID
    if (!gitHubRepositoryID) {
      return fatalError(`Cannot get issues for a repository that hasn't been inserted into the database!`)
    }

    const db = this.db

    const latestUpdatedIssue = await db.issues
      .where('[gitHubRepositoryID+updated_at]')
      .equals([ gitHubRepositoryID ])
      .last()

    debugger

    return latestUpdatedIssue
      ? latestUpdatedIssue.updated_at || null
      : null
  }

  /**
   * Fetch the issues for the repository. This will delete any issues that have
   * been closed and update or add any issues that have changed or been added.
   */
  public async fetchIssues(repository: GitHubRepository, account: Account) {
    const api = new API(account)
    const lastUpdatedAt = await this.getLatestUpdatedAt(repository)

    let issues: ReadonlyArray<IAPIIssue>
    if (lastUpdatedAt) {
      const since = new Date(lastUpdatedAt)
      debugger
      issues = await api.fetchIssues(repository.owner.login, repository.name, 'all', since)
    } else {
      issues = await api.fetchIssues(repository.owner.login, repository.name, 'open', null)
    }

    this.storeIssues(issues, repository)
  }

  private async storeIssues(issues: ReadonlyArray<IAPIIssue>, repository: GitHubRepository): Promise<void> {
    const gitHubRepositoryID = repository.dbID
    if (!gitHubRepositoryID) {
      fatalError(`Cannot store issues for a repository that hasn't been inserted into the database!`)
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

    function findIssueInRepositoryByNumber(gitHubRepositoryID: number, issueNumber: number) {
      return db.issues
        .where('[gitHubRepositoryID+number]')
        .equals([ gitHubRepositoryID, issueNumber ])
        .limit(1)
        .first()
    }

    await this.db.transaction('rw', this.db.issues, function*() {
      for (const issue of issuesToDelete) {
        const existing = yield findIssueInRepositoryByNumber(gitHubRepositoryID, issue.number)
        if (existing) {
          yield db.issues.delete(existing.id)
        }
      }

      for (const issue of issuesToUpsert) {
        const existing = yield findIssueInRepositoryByNumber(gitHubRepositoryID, issue.number)
        if (existing) {
          yield db.issues.update(existing.id, issue)
        } else {
          yield db.issues.add(issue)
        }
      }
    })
  }

  /** Get issues whose title or number matches the text. */
  public async getIssuesMatching(repository: GitHubRepository, text: string): Promise<ReadonlyArray<IIssue>> {
    const gitHubRepositoryID = repository.dbID
    if (!gitHubRepositoryID) {
      fatalError(`Cannot get issues for a repository that hasn't been inserted into the database!`)
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

    const issues = await issuesCollection
      .limit(IssueResultsHardLimit)
      .toArray()

    return issues.sort((a, b) => score(b) - score(a))
  }
}
