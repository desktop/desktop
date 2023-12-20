const isPending = <T>(item: unknown | Promise<T>): item is Promise<T> =>
  typeof item === 'object' && item !== null && 'then' in item

/**
 * An asynchronous operation cache with a configurable expiration time.
 *
 * Supports synchronously checking whether the operation result is available.
 */
export class ExpiringOperationCache<TKey, T> {
  private readonly data: Map<
    string,
    { item: T; timeoutId?: number } | Promise<T>
  > = new Map()

  public constructor(
    /** Function returning a unique string used as the underlying cache key */
    private readonly keyFunc: (key: TKey) => string,
    /**
     * Function returning a promise resolving to the operation result for the
     * given key
     **/
    private readonly valueFunc: (key: TKey) => Promise<T>,
    /**
     * Function returning number of milliseconds (or Infinity) to store the
     * operation result before it expires. Defaults to Infinity.
     */
    private readonly expirationFunc: (key: TKey, value: T) => number = () =>
      Infinity
  ) {}

  /**
   * Store the given value in the cache.
   *
   * Useful for preloading the cache. Note that this overrides any existing or
   * pending operation result for the given key.
   */
  public set(key: TKey, value: T, expiresIn?: number) {
    const timeout = expiresIn ?? this.expirationFunc(key, value)

    if (timeout <= 0) {
      return this.delete(key)
    }

    const cacheKey = this.keyFunc(key)
    const item = {
      item: value,
      timeoutId: isFinite(timeout)
        ? window.setTimeout(() => {
            if (this.data.get(cacheKey) === item) {
              this.data.delete(cacheKey)
            }
          }, timeout)
        : undefined,
    }

    this.delete(key)
    this.data.set(cacheKey, item)
  }

  /**
   * Manually expire the operation result for the given key.
   */
  public delete(key: TKey) {
    const cacheKey = this.keyFunc(key)
    const cached = this.data.get(cacheKey)

    if (cached && !isPending(cached)) {
      if (cached.timeoutId !== undefined) {
        window.clearTimeout(cached.timeoutId)
      }
    }

    this.data.delete(cacheKey)
  }

  /**
   * Attempt to synchronously return the cached operation result
   */
  public tryGet(key: TKey): T | undefined {
    const cached = this.data.get(this.keyFunc(key))
    return cached && !isPending(cached) ? cached.item : undefined
  }

  /**
   * Asynchronously return the cached operation result, or start the operation
   */
  public async get(key: TKey): Promise<T> {
    const cacheKey = this.keyFunc(key)
    const cached = this.data.get(cacheKey)

    if (cached) {
      return isPending(cached) ? cached : cached.item
    }

    const promise = this.valueFunc(key)
      .then(value => {
        if (this.data.get(cacheKey) === promise) {
          this.set(key, value)
        }
        return value
      })
      .catch(e => {
        if (this.data.get(cacheKey) === promise) {
          this.data.delete(cacheKey)
        }
        return Promise.reject(e)
      })

    this.data.set(this.keyFunc(key), promise)
    return promise
  }
}
