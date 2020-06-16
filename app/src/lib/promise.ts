/**
 * Wrap a promise in a minimum timeout, so that it only returns after both the
 * timeout and promise have completed.
 *
 * This is ideal for scenarios where a promises may complete quickly, but the
 * caller wants to introduce a minimum latency so that any dependent UI is
 *
 * @param action the promise work to track
 * @param timeoutMs the minimum time to wait before resolving the promise (in milliseconds)
 */
export function promiseWithMinimumTimeout<T>(
  action: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.all([action(), sleep(timeoutMs)]).then(x => x[0])
}

/**
 * `async`/`await`-friendly wrapper around `window.setTimeout` for places where
 * callers want to defer async work and avoid the ceremony of this setup and
 * using callbacks
 *
 * @param timeout the time to wait before resolving the promise (in milliseconds)
 */
export async function sleep(timeout: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, timeout))
}

/**
 * Helper function which lets callers define a maximum time to wait for
 * a promise to complete after which a default value is returned instead.
 *
 * @param promise The promise to wait on
 * @param timeout The maximum time to wait in milliseconds
 * @param fallbackValue The default value to return should the promise
 *                      not complete within `timeout` milliseconds.
 */
export async function timeout<T>(
  promise: Promise<T>,
  timeout: number,
  fallbackValue: T
): Promise<T> {
  let timeoutId: number | null = null
  const timeoutPromise = new Promise<T>(resolve => {
    timeoutId = window.setTimeout(() => resolve(fallbackValue), timeout)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
  })
}
