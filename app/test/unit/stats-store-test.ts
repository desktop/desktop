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

  it("unsubscribes from the activity monitor when it's no longer needed", async () => {
    const statsDb = await createStatsDb()
    const activityMonitor = new TestActivityMonitor()

    new StatsStore(statsDb, activityMonitor, fakePost)

    expect(activityMonitor.subscriptionCount).toBe(1)

    activityMonitor.fakeMouseActivity()

    expect(activityMonitor.subscriptionCount).toBe(0)

    // Use a read-write transaction to ensure that the write operation
    // from the StatsStore has completed before we try reading the table.
    await statsDb.transaction('rw!', statsDb.dailyMeasures, async () => {
      const statsEntry = await statsDb.dailyMeasures.limit(1).first()

      expect(statsEntry).not.toBeUndefined()
      expect(statsEntry!.active).toBe(true)
    })
  })

  it('resubscribes to the activity monitor after submitting', async () => {
    const statsDb = await createStatsDb()
    const activityMonitor = new TestActivityMonitor()

    const store = new StatsStore(statsDb, activityMonitor, fakePost)

    expect(activityMonitor.subscriptionCount).toBe(1)

    activityMonitor.fakeMouseActivity()

    expect(activityMonitor.subscriptionCount).toBe(0)

    // HACK: The stats store is hard coded to bail out of the
    // reporting method if running in a test-environment so
    // we'll have to pull an ugly workaround here and call
    // the instance member that we know for sure gets called
    // after stats submission
    await store.clearDailyStats()
    expect(activityMonitor.subscriptionCount).toBe(1)
  })
})
