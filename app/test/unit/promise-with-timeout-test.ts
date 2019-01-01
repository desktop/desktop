import { promiseWithMinimumTimeout } from '../../src/lib/promise'

jest.useFakeTimers()

describe('promiseWithMinimumTimeout', () => {
  it('handles promise finishing before timeout', async () => {
    const resolveMock = jest.fn().mockImplementation(resolve => resolve(42))

    const fastPromise = new Promise<number>(resolve => {
      window.setTimeout(() => resolveMock(resolve), 100)
    })

    const promise = promiseWithMinimumTimeout(() => fastPromise, 500)

    // promise completes
    jest.advanceTimersByTime(250)
    expect(resolveMock.mock.calls.length).toBe(1)

    // timeout completes
    jest.advanceTimersByTime(250)

    const result = await promise

    expect(result).toBe(42)
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

    expect(result).toBe(42)
  })

  it('handles promise finishing after timeout', async () => {
    const resolveMock = jest.fn().mockImplementation(resolve => resolve(42))

    const slowPromise = new Promise<number>(resolve => {
      window.setTimeout(() => resolveMock(resolve), 1000)
    })

    const promise = promiseWithMinimumTimeout(() => slowPromise, 500)

    // timeout completes
    jest.advanceTimersByTime(500)
    expect(resolveMock.mock.calls.length).toBe(0)

    // promise completes
    jest.advanceTimersByTime(500)
    expect(resolveMock.mock.calls.length).toBe(1)

    const result = await promise

    expect(result).toBe(42)
  })
})
