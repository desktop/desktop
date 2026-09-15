import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert'
import { promiseWithMinimumTimeout } from '../../src/lib/promise'

describe('promiseWithMinimumTimeout', () => {
  beforeEach(() => mock.timers.enable())
  afterEach(() => mock.timers.reset())

  it('handles promise finishing before timeout', async () => {
    const resolveMock = mock.fn((resolve: (n: any) => void) => resolve(42))

    const fastPromise = new Promise<number>(resolve => {
      window.setTimeout(() => resolveMock(resolve), 100)
    })

    const promise = promiseWithMinimumTimeout(() => fastPromise, 500)

    // promise completes
    mock.timers.tick(250)
    assert.equal(resolveMock.mock.calls.length, 1)

    // timeout completes
    mock.timers.tick(250)

    const result = await promise

    assert.equal(result, 42)
  })

  it('handles promise and timeout finishing together', async () => {
    const mediumPromise = new Promise<number>(resolve => {
      window.setTimeout(() => {
        resolve(42)
      }, 500)
    })

    const promise = promiseWithMinimumTimeout(() => mediumPromise, 500)

    // both complete
    mock.timers.tick(500)

    const result = await promise

    assert.equal(result, 42)
  })

  it('handles promise finishing after timeout', async () => {
    const resolveMock = mock.fn((resolve: (n: any) => void) => resolve(42))

    const slowPromise = new Promise<number>(resolve => {
      window.setTimeout(() => resolveMock(resolve), 1000)
    })

    const promise = promiseWithMinimumTimeout(() => slowPromise, 500)

    // timeout completes
    mock.timers.tick(500)
    assert.equal(resolveMock.mock.calls.length, 0)

    // promise completes
    mock.timers.tick(500)
    assert.equal(resolveMock.mock.calls.length, 1)

    const result = await promise

    assert.equal(result, 42)
  })

  it('handles actions returning null', async () => {
    const promise = promiseWithMinimumTimeout(() => Promise.resolve(null), 500)
    mock.timers.tick(500)
    assert.equal(await promise, null)
  })
})
