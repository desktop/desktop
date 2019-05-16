import { PromiseCache } from '../../src/lib/promise-cache'

describe('PromiseCache', () => {
  it('returns the same promise', () => {
    // this promise never completes, to ensure it is not evacuated
    // from the cache

    const createPromise = jest.fn(
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
})
