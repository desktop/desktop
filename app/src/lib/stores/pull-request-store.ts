import { PullRequestDatabase } from '../databases'

/** The store for GitHub Pull Requests. */
export class PullRequestStore {
  private db: PullRequestDatabase

  public constructor(db: PullRequestDatabase) {
    this.db = db
  }
}
