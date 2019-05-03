let measuringPerf = false
let markID = 0

/** Start capturing git performance measurements. */
export function start() {
  measuringPerf = true
}

/** Stop capturing git performance measurements. */
export function stop() {
  measuringPerf = false
}

/** Measure an async git operation. */
export async function measure<T>(
  cmd: string,
  fn: () => Promise<T>
): Promise<T> {
  const id = ++markID

  log.debug(`Executing ${cmd}`)
  const startTime = performance && performance.now ? performance.now() : null

  markBegin(id, cmd)
  try {
    return await fn()
  } finally {
    if (startTime) {
      const rawTime = performance.now() - startTime
      if (rawTime > 100) {
        const timeInSeconds = (rawTime / 1000).toFixed(3)
        log.warn(`Executing ${cmd} (took ${timeInSeconds}s)`)
      }
    }

    markEnd(id, cmd)
  }
}

/** Mark the beginning of a git operation. */
function markBegin(id: number, cmd: string) {
  if (!measuringPerf) {
    return
  }

  const markName = `${id}::${cmd}`
  performance.mark(markName)
}

/** Mark the end of a git operation. */
function markEnd(id: number, cmd: string) {
  if (!measuringPerf) {
    return
  }

  const markName = `${id}::${cmd}`
  const measurementName = cmd
  performance.measure(measurementName, markName)

  performance.clearMarks(markName)
  performance.clearMeasures(measurementName)
}
