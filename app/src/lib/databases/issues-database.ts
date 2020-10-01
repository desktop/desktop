import Dexie from 'dexie'
import { BaseDatabase } from './base-database'

export interface IIssue {
  readonly id?: number
  readonly gitHubRepositoryID: number
  readonly number: number
  readonly title: string
  readonly updated_at?: string
}

export class IssuesDatabase extends BaseDatabase {
  public issues!: Dexie.Table<IIssue, number>

  public constructor(name: string, schemaVersion?: number) {
    super(name, schemaVersion)

    this.conditionalVersion(1, {
      issues: '++id, &[gitHubRepositoryID+number], gitHubRepositoryID, number',
    })

    this.conditionalVersion(
      2,
      {
        issues:
          '++id, &[gitHubRepositoryID+number], gitHubRepositoryID, number, [gitHubRepositoryID+updated_at]',
      },
      clearIssues
    )
  }

  public getIssuesForRepository(gitHubRepositoryID: number) {
    return this.issues
      .where('gitHubRepositoryID')
      .equals(gitHubRepositoryID)
      .toArray()
  }
}

function clearIssues(transaction: Dexie.Transaction) {
  // Clear deprecated localStorage keys, we compute the since parameter
  // using the database now.
  clearDeprecatedKeys()

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
  return transaction.table('issues').clear()
}

function clearDeprecatedKeys() {
  Object.keys(localStorage)
    .filter(key => /^IssuesStore\/\d+\/lastFetch$/.test(key))
    .forEach(key => localStorage.removeItem(key))
}
