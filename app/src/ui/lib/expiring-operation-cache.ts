const isPending = <T>(item: unknown | Promise<T>): item is Promise<T> =>
  typeof item === 'object' && item !== null && 'then' in item

export class ExpiringOperationCache<TKey, T> {
  private readonly data: Map<
    string,
    { item: T; timeoutId?: number } | Promise<T>
  > = new Map()

  public constructor(
    private readonly keyFunc: (key: TKey) => string,
    private readonly valueFunc: (key: TKey) => Promise<T>,
    private readonly expirationFunc: (key: TKey, value: T) => number = () =>
      Infinity
  ) {}

  public set(key: TKey, value: T, expiresIn?: number) {
    const timeout = expiresIn ?? this.expirationFunc(key, value)

    if (timeout <= 0) {
      return
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

    this.data.set(cacheKey, item)
  }

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

  public tryGet(key: TKey): T | undefined {
    const cached = this.data.get(this.keyFunc(key))
    return cached && !isPending(cached) ? cached.item : undefined
  }

  public async get(key: TKey): Promise<T> {
    const cached = this.data.get(this.keyFunc(key))

    if (cached) {
      return isPending(cached) ? cached : cached.item
    }

    const promise = this.valueFunc(key)
      .then(value => {
        if (this.data.get(this.keyFunc(key)) === promise) {
          this.set(key, value)
        }
        return value
      })
      .catch(e => {
        if (this.data.get(this.keyFunc(key)) === promise) {
          this.data.delete(this.keyFunc(key))
        }
        return Promise.reject(e)
      })

    this.data.set(this.keyFunc(key), promise)
    return promise
  }
}
