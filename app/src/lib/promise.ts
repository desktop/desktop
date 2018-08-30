/**
 * Wrap a promise in a minimum timeout, so that it only returns after both the
 * timeout and promise have completed.
 *
 * This is ideal for scenarios where a promises may complete quickly, but the
 * caller wants to introduce a minimum latency so that any dependent UI is
 *
 *
 * @param action the promise work to track
 * @param timeout the minimum time to wait before resolving the promise (milliseconds)
 */
export function promiseWithMinimumTimeout<T>(
  action: () => Promise<T>,
  timeout: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timeoutExpired = false
    let result: T | null = null

    const resolveIfTimeout = () => {
      if (result != null && timeoutExpired) {
        resolve(result)
      }
    }

    window.setTimeout(() => {
      timeoutExpired = true
      resolveIfTimeout()
    }, timeout)

    action()
      .then(r => {
        result = r
        resolveIfTimeout()
      })
      .catch(reject)
  })
}
