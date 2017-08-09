async function awaitAnimationFrame(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    requestAnimationFrame(resolve)
  })
}

/** The amount of time in milliseconds that we'll dedicate to queued work. */
const WorkWindowMs = 10

/**
 * Split up high-priority synchronous work items across multiple animation frames.
 *
 * This function can be used to divvy up a set of tasks that needs to be executed
 * as quickly as possible with minimal interference to the browser's rendering.
 *
 * It does so by executing one work item per animation frame, potentially
 * squeezing in more if there's time left in the frame to do so.
 *
 * @param items  A set of work items to be executed across one or more animation
 *               frames
 *
 * @param worker A worker which, given a work item, performs work and returns
 *               either a promise or a synchronous result
 */
export async function queueWorkHigh<T>(
  items: Iterable<T>,
  worker: (item: T) => Promise<any> | any
) {
  const iterator = items[Symbol.iterator]()
  let next = iterator.next()

  while (!next.done) {
    const start = await awaitAnimationFrame()

    // Run one or more work items inside the animation frame. We will always run
    // at least one task but we may run more if we can squeeze them into a 10ms
    // window (frames have 1s/60 = 16.6ms available and we want to leave a little
    // for the browser).
    do {
      // Promise.resolve lets us pass either a const value or a promise and it'll
      // ensure we get an awaitable promise back.
      await Promise.resolve(worker(next.value))
      next = iterator.next()
    } while (!next.done && performance.now() - start < WorkWindowMs)
  }
}
