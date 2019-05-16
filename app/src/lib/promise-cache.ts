import { Emitter, Disposable } from 'event-kit'

/**
 * A generic promise cache for use where the application is running an action
 * that can take a long time to complete. This should be used when
 */
export class PromiseCache<TInput, TResult> {
  private readonly cache = new Map<string, Promise<TResult>>()
  private readonly emitter = new Emitter()

  public constructor(
    /**
     * A unique identifier for the cache to help with development-time tracing
     */
    private readonly kind: string,
    /**
     * A function to compute the key of the input object, which is then used to
     * lookup a cached promise. This key should be stable and predictable to
     * ensure only one promise is alive per input object.
     */
    private readonly getKey: (input: TInput) => string,
    /**
     * The function to create the new promise, which will be wrapped and managed
     * by the cache.
     *
     * Errors are not swallowed by the cache, so ensure the caller has wrapped
     * the function being used here in its own error handling, to ensure it
     * does not propagate into the app itself.
     */
    private readonly create: (input: TInput) => Promise<TResult>
  ) {}

  public onPromiseCreated(fn: (input: TInput) => void): Disposable {
    return this.emitter.on('promise-created', fn)
  }

  private promiseWasCreated(input: TInput) {
    this.emitter.emit('promise-created', input)
  }

  public onPromiseCompleted(fn: (input: TInput) => void): Disposable {
    return this.emitter.on('promise-completed', fn)
  }

  private promiseDidComplete(input: TInput) {
    this.emitter.emit('promise-completed', input)
  }

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
      this.promiseDidComplete(input)
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

    this.promiseWasCreated(input)

    this.cache.set(key, wrappedPromise)
    return wrappedPromise
  }
}
