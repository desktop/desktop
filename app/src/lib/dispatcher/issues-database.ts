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
    }).upgrade(t => {

      // Clear deprecated localStorage keys, we compute the since parameter
      // using the database now.
      Object.keys(localStorage)
        .filter(key => /IssuesStore\/\d+\/lastFetch/.test(key))
        .forEach(key => localStorage.removeItem(key))

      return t.table('issues').clear()
    })
  }
}
