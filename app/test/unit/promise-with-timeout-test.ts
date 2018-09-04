import { expect } from 'chai'

import { promiseWithMinimumTimeout } from '../../src/lib/promise'

jest.useFakeTimers()

describe('promiseWithMinimumTimeout', () => {
  it('handles promise finishing before timeout', async () => {
    let promiseCallbackFired = false

    const fastPromise = new Promise<number>(resolve => {
      window.setTimeout(() => {
        resolve(42)
        promiseCallbackFired = true
      }, 100)
    })

    const promise = promiseWithMinimumTimeout(() => fastPromise, 500)

    // promise completes
    jest.advanceTimersByTime(250)
    expect(promiseCallbackFired).is.true

    // timeout completes
    jest.advanceTimersByTime(250)

    const result = await promise

    expect(result).equals(42)
  })

  it('handles promise and timeout finishing together', async () => {
    const mediumPromise = new Promise<number>(resolve => {
      window.setTimeout(() => {
        resolve(42)
      }, 500)
    })

    const promise = promiseWithMinimumTimeout(() => mediumPromise, 500)

    // both complete
    jest.advanceTimersByTime(500)

    const result = await promise

    expect(result).equals(42)
  })

  it('handles promise finishing after timeout', async () => {
    let promiseCallbackFired = false

    const slowPromise = new Promise<number>(resolve => {
      window.setTimeout(() => {
        resolve(42)
        promiseCallbackFired = true
      }, 1000)
    })

    const promise = promiseWithMinimumTimeout(() => slowPromise, 500)

    // timeout completes
    jest.advanceTimersByTime(500)
    expect(promiseCallbackFired).is.false

    // promise completes
    jest.advanceTimersByTime(500)
    expect(promiseCallbackFired).is.true

    const result = await promise

    expect(result).equals(42)
  })
})
