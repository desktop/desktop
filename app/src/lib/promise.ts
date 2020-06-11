/**
 * Wrap a promise in a minimum timeout, so that it only returns after both the
 * timeout and promise have completed.
 *
 * This is ideal for scenarios where a promises may complete quickly, but the
 * caller wants to introduce a minimum latency so that any dependent UI is
 *
 *
 * @param action the promise work to track
 * @param timeoutMs the minimum time to wait before resolving the promise (in milliseconds)
 */
export function promiseWithMinimumTimeout<T>(
  action: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.all([action(), timeout(timeoutMs)]).then(x => x[0])
}

/**
 * `async`/`await`-friendly wrapper around `window.setTimeout` for places where
 * callers want to defer async work and avoid the ceremony of this setup and
 * using callbacks
 *
 * @param timeout the time to wait before resolving the promise (in milliseconds)
 */
export async function timeout(timeout: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, timeout))
}
