async function awaitIdle(): Promise<IdleDeadline> {
  return new Promise<IdleDeadline>((resolve, reject) => {
    requestIdleCallback((deadline) => {
      resolve(deadline)
    })
  })
}

export async function queueWorkIdle<T>(items: Iterable<T>, worker: (item: T) => Promise<any> | any) {
  const iterator = items[Symbol.iterator]()
  let next = iterator.next()

  while (!next.done) {
    const deadline = await awaitIdle()

    while (!next.done && deadline.timeRemaining() > 0) {
      await Promise.resolve(worker(next.value))
      next = iterator.next()
    }
  }
}
