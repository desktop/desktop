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
    localStorage.removeItem('has-sent-stats-opt-in-ping')
    localStorage.removeItem('last-daily-stats-report')
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

  it('reports stats on demand in a test environment', async () => {
    statsDb = await createStatsDb()
    const activityMonitor = new TestActivityMonitor()
    const postedBodies: Array<Record<string, any>> = []
    localStorage.setItem('has-sent-stats-opt-in-ping', '1')

    const store = new StatsStore(statsDb, activityMonitor, async body => {
      postedBodies.push(body)
      return new Response(null, { status: 200 })
    })

    await store.increment('commits')
    await store.sendStats([], [])

    assert.strictEqual(postedBodies.length, 1)
    assert.strictEqual(postedBodies[0].eventType, 'usage')
    assert.strictEqual(postedBodies[0].commits, 1)
    assert.strictEqual(localStorage.getItem('last-daily-stats-report'), null)
    assert.strictEqual(await statsDb.dailyMeasures.count(), 1)
  })

  it('posts structured stats to the new endpoint', async t => {
    statsDb = await createStatsDb()
    const activityMonitor = new TestActivityMonitor()
    let requestUrl: string | undefined
    let requestBody: string | undefined
    const previousPreviewFeatures = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    localStorage.setItem('has-sent-stats-opt-in-ping', '1')
    process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
    t.after(() => {
      if (previousPreviewFeatures === undefined) {
        delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
      } else {
        process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreviewFeatures
      }
    })

    t.mock.method(
      globalThis,
      'fetch',
      async (input: string | URL | Request, init?: RequestInit) => {
        requestUrl = String(input)
        requestBody = typeof init?.body === 'string' ? init.body : undefined
        return new Response(null, { status: 200 })
      }
    )

    const store = new StatsStore(statsDb, activityMonitor)
    await store.increment('commits')
    await store.recordLaunchStats({
      mainReadyTime: 112.29,
      loadTime: 15481.89,
      rendererReadyTime: 7216.25,
    })

    assert.strictEqual(await store.sendStats([], []), true)
    assert.strictEqual(
      requestUrl,
      'https://cafe.github.com/twirp/clientappsfe.observability.v1.TelemetryAPI/RecordEvents'
    )
    assert.notStrictEqual(requestBody, undefined)

    const payload = JSON.parse(requestBody ?? '')
    assert.strictEqual(payload.events[0].app, 'desktop')
    assert.strictEqual(payload.events[0].event_type, 'usage')
    assert.strictEqual(payload.events[0].measures.commits, 1)
    assert.strictEqual(payload.events[0].measures.mainReadyTime, 112)
    assert.strictEqual(payload.events[0].measures.loadTime, 15482)
    assert.strictEqual(payload.events[0].measures.rendererReadyTime, 7216)
    assert.strictEqual(payload.events[0].dimensions.version, 'dev')
    assert.ok(Buffer.byteLength(requestBody ?? '') < 16 * 1024)
  })
})
