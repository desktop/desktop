/* eslint-disable */
// This is a simple function that just returns Promise.resolve() It is used in instances when we want to queue a
// microtask before moving onto the next operation, but want to do so in a very explicit manner: `await microtask`
// looks a lot clearer in intent than `await void 0` or `await Promise.resolve()`.
//
// You would want to use `await microtask()` if you have something that needs to be done very urgently, but still
// needs to be done asynchronously. This will _not_ yield to the browser for any UI updates or wait for idle, instead
// it queues a task in the "microtask" which is run immediately after the current stack. Use this sparingly. This
// will likely delay subsequent code for 0-10ms.
export function microtask(): Promise<void> {
  return Promise.resolve()
}

// This function simply Promisifies requestAnimationFrame so it is awaitable.
//
// You would want to use `await animationFrame()` if you're happy to yield to the browser to complete any UI updates
// before calling your next piece of code. This is useful if - for example - you need to wait for scroll events,
// or CSS transitions or something. This will likely delay subsequent code for 16ms or so - much longer (30-60ms)
// if the tab is not focussed.
export function animationFrame(): Promise<number> {
  return new Promise(window.requestAnimationFrame)
}

// Rejects a promise after a timeout has elapsed. The promise is never
// successfully fulfilled.
//
// Examples
//
//   try {
//     const value = await Promise.race([timeout(100), somethingSlow()])
//     console.log('Slow operation finished within the timeout', value)
//   } catch (e) {
//     console.log('Slow operation did not finish', e)
//   }
//
// Returns a rejected Promise rejected after a timeout.
export async function timeout(ms: number, signal?: AbortSignal): Promise<void> {
  let id
  const done = new Promise<void>((resolve, reject) => {
    id = self.setTimeout(() => reject(new Error('timeout')), ms)
  })
  if (!signal) return done
  try {
    await Promise.race([done, whenAborted(signal)])
  } catch (e) {
    self.clearTimeout(id)
    throw e
  }
}

// Fulfills a promise after a timeout has elapsed. The promise is never rejected.
//
// Examples
//
//   step1()
//   await wait(100)
//   step2()
//
// Returns a Promise fulfilled after a timeout.
export async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  let id
  const done = new Promise<void>(resolve => {
    id = self.setTimeout(resolve, ms)
  })
  if (!signal) return done
  try {
    await Promise.race([done, whenAborted(signal)])
  } catch (e) {
    self.clearTimeout(id)
    throw e
  }
}

// Attempt to yield a value from an async function, retrying on rejections
// with an exponential backoff delay between attempts. If the function never
// yields a fulfilled promise, the final rejection error is thrown.
//
// Examples
//
//   try {
//     const connect = async () => {…}
//     const value = await retry(connect, 3)
//     console.log('Connected eventually', value)
//   } catch (e) {
//     console.log('Could not connect after three attempts', e)
//   }
//
// Returns a promise fulfilled by the function or rejected after attempts expire.
export async function retry<T>(
  fn: () => Promise<T>,
  attempts: number,
  maxDelay = Infinity,
  signal?: AbortSignal
): Promise<T> {
  const aborted = signal ? whenAborted(signal) : null
  for (let i = 0; i < attempts; i++) {
    try {
      const op = aborted ? Promise.race([fn(), aborted]) : fn()
      return await op
    } catch (e) {
      if (e.name === 'AbortError') throw e
      if (i === attempts - 1) throw e
      const ms = Math.pow(2, i) * 1000
      const vary = rand(ms * 0.1)
      await wait(Math.min(maxDelay, ms + vary), signal)
    }
  }
  throw new Error('retry failed')
}

function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((resolve, reject) => {
    const error = new Error('aborted')
    error.name = 'AbortError'
    if (signal.aborted) {
      reject(error)
    } else {
      signal.addEventListener('abort', () => reject(error))
    }
  })
}

function rand(max: number): number {
  return Math.floor(Math.random() * Math.floor(max))
}

export function taskQueue<T>(fn: (values: T[]) => unknown): (value: T) => void {
  const queue: T[] = []
  return function (value: T) {
    queue.push(value)
    if (queue.length === 1) {
      queueMicrotask(() => {
        const values = [...queue]
        queue.length = 0
        fn(values)
      })
    }
  }
}
