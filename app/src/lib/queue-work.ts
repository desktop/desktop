async function awaitAnimationFrame(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    requestAnimationFrame(resolve)
  })
}

export async function queueWorkHigh<T>(items: Iterable<T>, worker: (item: T) => Promise<any> | any) {
  const iterator = items[Symbol.iterator]()
  let next = iterator.next()

  while (!next.done) {
    const start = await awaitAnimationFrame()

    // Run one or more work items inside the animation frame. We will always run
    // at least one task but we may run more if we can squeeze them into a 10ms
    // window (frames have 1s/60 = 16.6ms available and we want to leave a little
    // for the browser).
    do {
      await Promise.resolve(worker(next.value))
      next = iterator.next()
    } while (!next.done && performance.now() - start < 10)
  }
}
