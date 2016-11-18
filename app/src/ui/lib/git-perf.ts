let measuringPerf = false
let markID = 0

export function start() {
  measuringPerf = true
}

export function end() {
  measuringPerf = false
}

export function getNextID(): number {
  return ++markID
}

export function markBegin(id: number, cmd: string) {
  if (!measuringPerf) { return }

  const markName = `${id}::${cmd}`
  performance.mark(markName)
}

export function markEnd(id: number, cmd: string) {
  if (!measuringPerf) { return }

  const markName = `${id}::${cmd}`
  const measurementName = cmd
  performance.measure(measurementName, markName)

  performance.clearMarks(markName)
  performance.clearMeasures(measurementName)
}
