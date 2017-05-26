import Dexie from 'dexie'

// NB: This _must_ be incremented whenever the DB key scheme changes.
const DatabaseVersion = 2

export interface IIssue {
  readonly id?: number
  readonly gitHubRepositoryID: number
  readonly number: number
  readonly title: string
  readonly updated_at?: string
}

export class IssuesDatabase extends Dexie {
  public issues: Dexie.Table<IIssue, number>

  public constructor(name: string) {
    super(name)

    this.version(1).stores({
      issues: '++id, &[gitHubRepositoryID+number], gitHubRepositoryID, number',
    })

    this.version(DatabaseVersion).stores({
      issues: '++id, &[gitHubRepositoryID+number], gitHubRepositoryID, number, [gitHubRepositoryID+updated_at]',
    }).upgrade(t => t.table('issues').clear())
  }
}
