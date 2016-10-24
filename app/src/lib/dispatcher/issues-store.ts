import { IssuesDatabase, IIssue } from './issues-database'
import { IAPIIssue } from '../api'
import { Repository } from '../../models/repository'

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
   * Store the given issues. This will delete any issues that have been closed
   * and update or add any issues that have changed or been added.
   */
  public async storeIssues(issues: ReadonlyArray<IAPIIssue>, repository: Repository): Promise<void> {
    if (!repository.gitHubRepository) {
      return
    }

    const issuesToDelete = issues.filter(i => i.state === 'closed')

    const repositoryID = repository.id
    const endpoint = repository.gitHubRepository.endpoint
    const issuesToUpsert = issues
      .filter(i => i.state === 'open')
      .map<IIssue>(i => {
        return {
          endpoint,
          repositoryID,
          number: i.number.toString(),
          title: i.title,
        }
      })

    const db = this.db
    await this.db.transaction('rw', this.db.issues, function*() {
      for (const issue of issuesToDelete) {
        const existing = yield db.issues
          .where('[endpoint+repositoryID+number]')
          .equals([ endpoint, repositoryID, issue.number ])
          .limit(1)
          .first()
        if (existing) {
          yield db.issues.delete(existing.id)
        }
      }

      for (const issue of issuesToUpsert) {
        const existing = yield db.issues
          .where('[endpoint+repositoryID+number]')
          .equals([ endpoint, repositoryID, issue.number ])
          .limit(1)
          .first()
        if (existing) {
          yield db.issues.update(existing.id, issue)
        } else {
          yield db.issues.add(issue)
        }
      }
    })
  }

  /** Get issues whose title or number matches the text. */
  public async getIssuesMatching(repository: Repository, text: string): Promise<ReadonlyArray<IIssue>> {
    if (!repository.gitHubRepository) {
      return Promise.resolve([])
    }

    // TODO: What happens for empty strings?

    const repositoryID = repository.id
    const endpoint = repository.gitHubRepository.endpoint
    const MaxScore = 1
    const score = (i: IIssue) => {
      if (i.number.startsWith(text)) {
        return MaxScore
      }

      if (i.title.toLowerCase().includes(text.toLowerCase())) {
        return MaxScore - 0.1
      }

      return 0
    }

    const issuesCollection = await this.db.issues
      .where('[endpoint+repositoryID]')
      .equals([ endpoint, repositoryID ])
      .limit(IssueResultsHardLimit)
      .filter(i => score(i) > 0)

    const issues = await issuesCollection.toArray()
    return issues.sort((a, b) => score(b) - score(a))
  }
}
