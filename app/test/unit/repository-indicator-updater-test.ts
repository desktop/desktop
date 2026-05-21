import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { RepositoryIndicatorUpdater } from '../../src/lib/stores/helpers/repository-indicator-updater'
import { Repository } from '../../src/models/repository'

type ScheduledTimer = {
  readonly id: number
  readonly timeout: number
  readonly callback: () => Promise<void>
  cleared: boolean
}

const originalWindow = globalThis.window
const originalLog = (globalThis as any).log

let scheduledTimers: ScheduledTimer[]
let nextTimerId: number

function repository(id: number) {
  return { id } as Repository
}

async function runNextTimer() {
  const timer = scheduledTimers.find(x => !x.cleared)
  assert.ok(timer, 'expected a scheduled timer')
  timer.cleared = true
  await timer.callback()
}

function activeTimers() {
  return scheduledTimers.filter(x => !x.cleared)
}

beforeEach(() => {
  scheduledTimers = []
  nextTimerId = 1
  ;(globalThis as any).window = {
    setTimeout: (callback: () => Promise<void>, timeout: number) => {
      const id = nextTimerId++
      scheduledTimers.push({ id, timeout, callback, cleared: false })
      return id
    },
    clearTimeout: (id: number) => {
      const timer = scheduledTimers.find(x => x.id === id)
      if (timer !== undefined) {
        timer.cleared = true
      }
    },
  }
  ;(globalThis as any).log = {
    debug: () => {},
    info: () => {},
  }
})

afterEach(() => {
  ;(globalThis as any).window = originalWindow
  ;(globalThis as any).log = originalLog
})

describe('RepositoryIndicatorUpdater', () => {
  it('keeps the existing initial periodic skew when started directly', () => {
    const updater = new RepositoryIndicatorUpdater(
      () => [],
      async () => {}
    )

    updater.start()

    const [timer] = activeTimers()
    assert.ok(timer.timeout >= 0)
    assert.ok(timer.timeout <= 30_000)
  })

  it('runs requested refreshes without waiting for the periodic interval', async () => {
    const refreshed: ReadonlyArray<Repository>[] = []
    const repositories = [repository(1), repository(2)]
    const updater = new RepositoryIndicatorUpdater(
      () => repositories,
      async repo => {
        refreshed.push([repo])
      }
    )

    updater.start()
    updater.requestRefresh()

    assert.equal(activeTimers().length, 1)
    assert.equal(activeTimers()[0].timeout, 0)

    await runNextTimer()

    assert.deepEqual(
      refreshed.flat().map(x => x.id),
      [1, 2]
    )
    assert.equal(activeTimers().length, 1)
    assert.ok(activeTimers()[0].timeout >= 15 * 60 * 1000)
  })

  it('queues at most one follow-up requested refresh while a scan is running', async () => {
    let refreshCount = 0
    const updater = new RepositoryIndicatorUpdater(
      () => [repository(1)],
      async () => {
        refreshCount++
        updater.requestRefresh()
        updater.requestRefresh()
      }
    )

    updater.requestRefresh()
    await runNextTimer()

    assert.equal(refreshCount, 1)
    assert.equal(activeTimers().length, 1)
    assert.equal(activeTimers()[0].timeout, 0)

    await runNextTimer()

    assert.equal(refreshCount, 2)
  })

  it('queues requested refreshes while a scan is paused before starting', async () => {
    let refreshCount = 0
    const updater = new RepositoryIndicatorUpdater(
      () => [repository(1)],
      async () => {
        refreshCount++
      }
    )

    updater.requestRefresh()
    updater.pause()

    const pausedRefresh = runNextTimer()

    updater.requestRefresh()

    assert.equal(activeTimers().length, 0)
    assert.equal(refreshCount, 0)

    updater.resume()
    await pausedRefresh

    assert.equal(refreshCount, 1)
    assert.equal(activeTimers().length, 1)
    assert.equal(activeTimers()[0].timeout, 0)
  })

  it('cancels pending refreshes and queued follow-ups when stopped', () => {
    let refreshCount = 0
    const updater = new RepositoryIndicatorUpdater(
      () => [repository(1)],
      async () => {
        refreshCount++
      }
    )

    updater.requestRefresh()
    updater.stop()

    assert.equal(activeTimers().length, 0)
    assert.equal(refreshCount, 0)
  })
})
