export class PromiseCache<TInput, TResult> {
  private readonly cache = new Map<string, Promise<TResult>>()

  public constructor(
    private readonly kind: string,
    private readonly getKey: (input: TInput) => string,
    private readonly create: (input: TInput) => Promise<TResult>
  ) {}

  public get(input: TInput): Promise<TResult> {
    const key = this.getKey(input)
    const existing = this.cache.get(key)

    if (existing != null) {
      log.debug(`[PromiseCache] returning cached promise for ${this.kind}`)
      return existing
    }

    const cleanup = () => {
      log.debug(
        `[PromiseCache] removing completed promise for cache for ${this.kind}`
      )
      this.cache.delete(key)
    }

    log.debug(`[PromiseCache] creating new promise to cache for ${this.kind}`)

    const wrappedPromise = this.create(input).then(
      result => {
        cleanup()
        return result
      },
      error => {
        cleanup()
        return Promise.reject(error)
      }
    )

    this.cache.set(key, wrappedPromise)
    return wrappedPromise
  }
}
