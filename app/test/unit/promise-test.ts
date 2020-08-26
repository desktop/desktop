import { timeout, sleep } from '../../src/lib/promise'

jest.useFakeTimers()

describe('timeout', () => {
  it('falls back to the fallback value if promise takes too long', async () => {
    const promise = timeout(
      sleep(1000).then(() => 'foo'),
      500,
      'bar'
    )
    jest.advanceTimersByTime(500)
    expect(await promise).toBe('bar')
  })

  it('returns the promise result if it finishes in time', async () => {
    const promise = timeout(Promise.resolve('foo'), 500, 'bar')
    jest.advanceTimersByTime(500)
    expect(await promise).toBe('foo')
  })
})
