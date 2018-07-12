import { expect } from 'chai'

import { TestStatsDatabase } from '../helpers/databases'

import { StatsStore } from '../../src/lib/stats'
import {
  UiActivityKind,
  IUiActivityMonitor,
} from '../../src/ui/lib/ui-activity-monitor'
import { Emitter, Disposable } from 'event-kit'

class FakeActivityMonitor implements IUiActivityMonitor {
  private readonly emitter = new Emitter()
  public subscriptionCount = 0

  public onActivity(handler: (kind: UiActivityKind) => void) {
    this.subscriptionCount++

    const disp = this.emitter.on('activity', handler)

    return new Disposable(() => {
      disp.dispose()
      this.subscriptionCount--
    })
  }

  private emit(kind: UiActivityKind) {
    this.emitter.emit('activity', kind)
  }

  public fakeMouseActivity() {
    this.emit('pointer')
  }

  public fakeKeyboardActivity() {
    this.emit('keyboard')
  }

  public fakeMenuActivity() {
    this.emit('menu')
  }
}

describe('StatsStore', () => {
  async function createStatsDb() {
    const statsDb = new TestStatsDatabase()
    await statsDb.reset()
    return statsDb
  }

  it("unsubscribes from the activity monitor when it's no longer needed", async () => {
    const statsDb = await createStatsDb()
    const activityMonitor = new FakeActivityMonitor()

    new StatsStore(statsDb, activityMonitor)

    expect(activityMonitor.subscriptionCount).to.equal(1)

    activityMonitor.fakeMouseActivity()

    expect(activityMonitor.subscriptionCount).to.equal(0)

    // Use a read-write transaction to ensure that the write operation
    // from the StatsStore has completed before we try reading the table.
    await statsDb.transaction('rw!', statsDb.dailyMeasures, async () => {
      const statsEntry = await statsDb.dailyMeasures.limit(1).first()

      expect(statsEntry).to.not.be.undefined
      expect(statsEntry!.active).to.be.true
    })
  })

  it('resubscribes to the activity monitor after submitting', async () => {
    const statsDb = await createStatsDb()
    const activityMonitor = new FakeActivityMonitor()

    const store = new StatsStore(statsDb, activityMonitor)

    expect(activityMonitor.subscriptionCount).to.equal(1)

    activityMonitor.fakeMouseActivity()

    expect(activityMonitor.subscriptionCount).to.equal(0)

    // HACK: The stats store is hard coded to bail out of the
    // reporting method if running in a test-environment so
    // we'll have to pull an ugly workaround here and call
    // the instance member that we know for sure gets called
    // after stats submission
    await store.clearDailyStats()
    expect(activityMonitor.subscriptionCount).to.equal(1)
  })
})
