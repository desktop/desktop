/**
 * Wrap a promise in a minimum timeout, so that it only returns after both the
 * timeout and promise have completed.
 *
 * This is ideal for scenarios where a promises may complete quickly, but the
 * caller wants to introduce a minimum latency so that any dependent UI is
 *
 *
 * @param action the promise work to track
 * @param timeout the minimum time to wait before resolving the promise (in milliseconds)
 */
export function promiseWithMinimumTimeout<T>(
  action: () => Promise<T>,
  timeout: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timeoutExpired = false
    let result: T | null = null

    const resolveIfBothDone = () => {
      if (result != null && timeoutExpired) {
        resolve(result)
        result = null
      }
    }

    window.setTimeout(() => {
      timeoutExpired = true
      resolveIfBothDone()
    }, timeout)

    action()
      .then(r => {
        result = r
        resolveIfBothDone()
      })
      .catch(reject)
  })
}

/**
 * `async`/`await`-friendly wrapper around `window.setTimeout` for places where
 * callers want to defer async work and avoid the ceremony of this setup and
 * using callbacks
 *
 * @param timeout the time to wait before resolving the promise (in milliseconds)
 */
export async function timeout(timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      resolve()
    }, timeout)
  })
}
