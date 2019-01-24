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
      pullRequestId: 1,
      state: 'success',
      totalCount: 1,
      sha: 'sha',
    }
    await database.pullRequestStatus.add(prStatus)
    const prStatusFromDb = await database.pullRequestStatus.get(1)
    expect(prStatusFromDb).not.toBeUndefined()
    expect(prStatusFromDb!.pullRequestId).toBe(prStatus.pullRequestId)

    database.close()
    database = new PullRequestDatabase(databaseName, 4)
    await database.open()

    const upgradedPrStatusFromDb = await database.pullRequestStatus.get(1)
    expect(upgradedPrStatusFromDb).not.toBeUndefined()
    expect(upgradedPrStatusFromDb!.pullRequestId).toBe(prStatus.pullRequestId)

    expect(upgradedPrStatusFromDb!.statuses).not.toBeUndefined()

    await database.delete()
  })
})
