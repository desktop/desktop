import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert'
import { TestStatsDatabase } from '../helpers/databases'

import { StatsStore } from '../../src/lib/stats'
import { TestActivityMonitor } from '../helpers/test-activity-monitor'
import { fakePost } from '../fake-stats-post'

describe('StatsStore', () => {
  async function createStatsDb() {
    const statsDb = new TestStatsDatabase()
    await statsDb.reset()
    return statsDb
  }
  let statsDb: TestStatsDatabase

  afterEach(() => {
    statsDb.close()
  })

  it("unsubscribes from the activity monitor when it's no longer needed", async () => {
    statsDb = await createStatsDb()
    const activityMonitor = new TestActivityMonitor()

    new StatsStore(statsDb, activityMonitor, fakePost)

    assert.equal(activityMonitor.subscriptionCount, 1)

    activityMonitor.fakeMouseActivity()

    assert.equal(activityMonitor.subscriptionCount, 0)

    // Use a read-write transaction to ensure that the write operation
    // from the StatsStore has completed before we try reading the table.
    await statsDb.transaction('rw!', statsDb.dailyMeasures, async () => {
      const statsEntry = await statsDb.dailyMeasures.limit(1).first()
      assert(statsEntry?.active === true)
    })
  })

  it('resubscribes to the activity monitor after submitting', async () => {
    statsDb = await createStatsDb()
    const activityMonitor = new TestActivityMonitor()

    const store = new StatsStore(statsDb, activityMonitor, fakePost)

    assert.equal(activityMonitor.subscriptionCount, 1)

    activityMonitor.fakeMouseActivity()

    assert.equal(activityMonitor.subscriptionCount, 0)

    // HACK: The stats store is hard coded to bail out of the
    // reporting method if running in a test-environment so
    // we'll have to pull an ugly workaround here and call
    // the instance member that we know for sure gets called
    // after stats submission
    await store.clearDailyStats()
    assert.equal(activityMonitor.subscriptionCount, 1)
  })
})
