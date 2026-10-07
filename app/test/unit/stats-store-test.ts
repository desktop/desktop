import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { ipcRenderer } from 'electron'
import { TestStatsDatabase } from '../helpers/databases'
import { mockNotification } from '../helpers/mock-notification'

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

  beforeEach(() => {
    const invoke = ipcRenderer.invoke
    mock.method(
      ipcRenderer,
      'invoke',
      async (channel: string, ...args: unknown[]) =>
        channel === 'get-notifications-permission'
          ? 'granted'
          : invoke(channel, ...args)
    )
  })

  afterEach(() => {
    mock.restoreAll()
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

  it('tracks GitHub Copilot app handoffs', async () => {
    statsDb = await createStatsDb()
    const store = new StatsStore(statsDb, new TestActivityMonitor(), fakePost)

    await store.increment('openInCopilotAppCount')

    const statsEntry = await statsDb.dailyMeasures.limit(1).first()
    assert.strictEqual(statsEntry?.openInCopilotAppCount, 1)
  })

  it('persists eligible and shown notification counts separately', async () => {
    statsDb = await createStatsDb()
    const store = new StatsStore(statsDb, new TestActivityMonitor(), fakePost)

    await store.increment('checksFailedNotificationCount', 2)
    await store.increment('checksFailedNotificationShownCount')
    await store.increment('pullRequestCommentNotificationCount', 2)
    await store.increment('pullRequestCommentNotificationShownCount')
    for (const state of [
      'APPROVED',
      'COMMENTED',
      'CHANGES_REQUESTED',
    ] as const) {
      await store.recordPullRequestReviewNotification(state)
      await store.recordPullRequestReviewNotification(state)
      await store.recordPullRequestReviewNotificationShown(state)
    }

    const statsEntry = await statsDb.dailyMeasures.limit(1).first()
    assert.strictEqual(statsEntry?.checksFailedNotificationCount, 2)
    assert.strictEqual(statsEntry?.checksFailedNotificationShownCount, 1)
    assert.strictEqual(statsEntry?.pullRequestCommentNotificationCount, 2)
    assert.strictEqual(statsEntry?.pullRequestCommentNotificationShownCount, 1)
    assert.strictEqual(
      statsEntry?.pullRequestReviewApprovedNotificationCount,
      2
    )
    assert.strictEqual(
      statsEntry?.pullRequestReviewApprovedNotificationShownCount,
      1
    )
    assert.strictEqual(
      statsEntry?.pullRequestReviewCommentedNotificationCount,
      2
    )
    assert.strictEqual(
      statsEntry?.pullRequestReviewCommentedNotificationShownCount,
      1
    )
    assert.strictEqual(
      statsEntry?.pullRequestReviewChangesRequestedNotificationCount,
      2
    )
    assert.strictEqual(
      statsEntry?.pullRequestReviewChangesRequestedNotificationShownCount,
      1
    )
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

  for (const permission of ['denied', null] as const) {
    it(`reports ${
      permission === null
        ? 'null after lookup failure'
        : 'false for denied permission'
    } to the new endpoint`, async t => {
      statsDb = await createStatsDb()
      localStorage.setItem('has-sent-stats-opt-in-ping', '1')
      mockNotification(t, {
        get permission() {
          if (permission !== null) {
            return permission
          }
          throw new Error('Permission lookup failed')
        },
      })
      const invoke = ipcRenderer.invoke
      t.mock.method(
        ipcRenderer,
        'invoke',
        async (channel: string, ...args: unknown[]) => {
          if (channel === 'get-notifications-permission') {
            if (permission !== null) {
              return permission
            }
            throw new Error('Permission lookup failed')
          }
          return invoke(channel, ...args)
        }
      )
      const warn = t.mock.method(log, 'warn')
      let requestBody: string | undefined
      t.mock.method(
        globalThis,
        'fetch',
        async (_input: string | URL | Request, init?: RequestInit) => {
          requestBody = typeof init?.body === 'string' ? init.body : undefined
          return new Response(null, { status: 200 })
        }
      )
      const store = new StatsStore(statsDb, new TestActivityMonitor())
      await store.increment('commits')

      assert.strictEqual(await store.sendStats([], []), true)
      assert.strictEqual(warn.mock.callCount(), permission === null ? 1 : 0)
      assert.ok(requestBody)
      const payload = JSON.parse(requestBody)
      assert.strictEqual(
        payload.events[0].dimensions.notificationsPermission,
        String(permission === null ? null : false)
      )
      assert.strictEqual(payload.events[0].measures.commits, 1)
      assert.strictEqual(
        'notificationsPermission' in payload.events[0].measures,
        false
      )
    })
  }
  it('posts structured stats to the new endpoint by default', async t => {
    statsDb = await createStatsDb()
    const activityMonitor = new TestActivityMonitor()
    let requestUrl: string | undefined
    let requestBody: string | undefined
    const previousPreviewFeatures = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    localStorage.setItem('has-sent-stats-opt-in-ping', '1')
    delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    t.after(() => {
      if (previousPreviewFeatures !== undefined) {
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
    await store.increment('checksFailedNotificationShownCount')
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
    assert.strictEqual(
      payload.events[0].measures.checksFailedNotificationShownCount,
      1
    )
    assert.strictEqual(payload.events[0].measures.mainReadyTime, 112)
    assert.strictEqual(payload.events[0].measures.loadTime, 15482)
    assert.strictEqual(payload.events[0].measures.rendererReadyTime, 7216)
    assert.strictEqual(payload.events[0].dimensions.version, 'dev')
    assert.strictEqual(
      payload.events[0].dimensions.notificationsPermission,
      __DARWIN__ || __WIN32__ ? 'true' : 'null'
    )
    assert.strictEqual(
      'notificationsPermission' in payload.events[0].measures,
      false
    )
    assert.strictEqual(
      typeof payload.events[0].dimensions.gitHooksEnvEnabled,
      'string'
    )
    assert.strictEqual(typeof payload.events[0].dimensions.active, 'string')
    assert.strictEqual(payload.events[0].measures.repositoryCount, 0)
    assert.ok(Buffer.byteLength(requestBody ?? '') < 16 * 1024)
  })

  it('posts structured opt-in pings to the new endpoint', async t => {
    statsDb = await createStatsDb()
    const activityMonitor = new TestActivityMonitor()
    let requestBody: string | undefined
    let resolveRequest: (() => void) | undefined
    const requestReceived = new Promise<void>(resolve => {
      resolveRequest = resolve
    })
    const previousPreviewFeatures = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
    localStorage.removeItem('has-sent-stats-opt-in-ping')
    localStorage.removeItem('stats-opt-out')
    t.after(() => {
      localStorage.removeItem('stats-opt-out')
      if (previousPreviewFeatures === undefined) {
        delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
      } else {
        process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreviewFeatures
      }
    })

    t.mock.method(
      globalThis,
      'fetch',
      async (_input: string | URL | Request, init?: RequestInit) => {
        requestBody = typeof init?.body === 'string' ? init.body : undefined
        resolveRequest?.()
        return new Response(null, { status: 200 })
      }
    )

    new StatsStore(statsDb, activityMonitor)
    await requestReceived

    const payload = JSON.parse(requestBody ?? '')
    assert.deepStrictEqual(payload.events[0], {
      app: 'desktop',
      event_type: 'ping',
      dimensions: {
        optIn: 'true',
        previousOptInValue: 'null',
      },
    })
  })
})
