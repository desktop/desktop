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

    this.version(DatabaseVersion)
      .stores({
        issues:
          '++id, &[gitHubRepositoryID+number], gitHubRepositoryID, number, [gitHubRepositoryID+updated_at]',
      })
      .upgrade(t => {
        // Clear deprecated localStorage keys, we compute the since parameter
        // using the database now.
        Object.keys(localStorage)
          .filter(key => /^IssuesStore\/\d+\/lastFetch$/.test(key))
          .forEach(key => localStorage.removeItem(key))

        // Unfortunately we have to clear the issues in order to maintain
        // data consistency in the database. The issues table is only supposed
        // to store 'open' issues and if we kept the existing issues (which)
        // don't have an updated_at field around the initial query for
        // max(updated_at) would return null, causing us to fetch all _open_
        // issues which in turn means we wouldn't be able to detect if we
        // have any issues in the database that have been closed since the
        // last time we fetched. Not only that, these closed issues wouldn't
        // be updated to include the updated_at field unless they were actually
        // modified at a later date.
        //
        // TL;DR; This is the safest approach
        return t.table('issues').clear()
      })
  }
}
