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

export async function concurrentMap<T, T1>(
  iterable: Iterable<T>,
  selector: (item: T) => PromiseLike<T1>,
  concurrency: number
): Promise<T1[]> {
  concurrency = Math.max(1, concurrency)

  const results = new Array<PromiseLike<T1>>()
  const currentlyExecuting = new Set<PromiseLike<void>>()

  for (const item of iterable) {
    const promise = selector(item)
    results.push(promise)

    const executionGate = promise.then(() => {
      currentlyExecuting.delete(executionGate)
    })

    currentlyExecuting.add(executionGate)

    if (currentlyExecuting.size >= concurrency) {
      await Promise.race(currentlyExecuting)
    }
  }

  return Promise.all(results)
}
