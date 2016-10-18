import Dexie from 'dexie'

// NB: This _must_ be incremented whenever the DB key scheme changes.
const DatabaseVersion = 1

export interface IIssue {
  readonly id?: number
  readonly endpoint: string
  readonly repositoryID: number
  readonly number: string
  readonly title: string
}

export class IssuesDatabase extends Dexie {
  public issues: Dexie.Table<IIssue, number>

  public constructor(name: string) {
    super(name)

    this.version(DatabaseVersion).stores({
      issues: '++id, &[endpoint+repositoryID+number]',
    })
  }
}
