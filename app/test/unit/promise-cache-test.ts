import { PromiseCache } from '../../src/lib/promise-cache'

describe('PromiseCache', () => {
  it('returns the same promise when the same key is provided and the promise has not expired', () => {
    const createPromise = jest.fn(
      // ensuring this promise never completes
      // tslint:disable-next-line:promise-must-complete
      (s: string) => new Promise((resolve, reject) => {})
    )

    const cache = new PromiseCache<string, void>(
      'test',
      s => s,
      s => createPromise(s)
    )

    const first = cache.get('thing')
    const second = cache.get('thing')

    expect(first).toBe(second)
    expect(createPromise).toHaveBeenCalledTimes(1)
  })

  it('returns different promise when different key used', () => {
    const createPromise = jest.fn(
      // ensuring this promise never completes
      // tslint:disable-next-line:promise-must-complete
      (s: string) => new Promise((resolve, reject) => {})
    )

    const cache = new PromiseCache<string, void>(
      'test',
      s => s,
      s => createPromise(s)
    )

    const first = cache.get('thing')
    const second = cache.get('another-thing')

    expect(first).not.toBe(second)
    expect(createPromise).toHaveBeenCalledTimes(2)
  })

  it('returns different promise when different key used', () => {
    const createPromise = jest.fn(
      // ensuring this promise never completes
      // tslint:disable-next-line:promise-must-complete
      (s: string) => new Promise((resolve, reject) => {})
    )

    const cache = new PromiseCache<string, void>(
      'test',
      s => s,
      s => createPromise(s)
    )

    const first = cache.get('thing')
    const second = cache.get('another-thing')

    expect(first).not.toBe(second)
    expect(createPromise).toHaveBeenCalledTimes(2)
  })
})
