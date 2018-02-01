import { expect } from 'chai'

import {
  PullRequestDatabase,
  IPullRequestStatus,
} from '../../src/lib/databases'

describe('PullRequestDatabase', () => {
  it("adds statuses key to records that don't have one on upgrade", async () => {
    const databaseName = 'TestPullRequestDatabase'
    let database = new PullRequestDatabase(databaseName, 3)

    await database.delete()
    await database.open()

    const prStatus: IPullRequestStatus = {
      id: 1,
      pullRequestId: 1,
      state: 'success',
      totalCount: 4,
      sha: 'sha',
    }

    await database.pullRequestStatus.add(prStatus)
    await database.pullRequestStatus.each(prStatus => {
      expect(prStatus.statuses).to.be.undefined
    })
    database.close()

    database = new PullRequestDatabase(databaseName, 4)

    await database.open()
    await database.pullRequestStatus.each(prStatus => {
      expect(prStatus.statuses).to.not.be.undefined
    })
    await database.delete()
  })
})
