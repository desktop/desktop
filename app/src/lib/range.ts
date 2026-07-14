// extracted from underscore, which in itself comes from Python
// https://github.com/jashkenas/underscore/blob/fc039f6a94fcf388d2b61ced4c02cd1ba116ecfd/underscore.js#L693-L710

export function range(
  start: number,
  stop: number,
  step?: number
): ReadonlyArray<number> {
  if (stop === null) {
    stop = start || 0
    start = 0
  }

  if (!step) {
    step = stop < start ? -1 : 1
  }

  const length = Math.max(Math.ceil((stop - start) / step), 0)
  const range = new Array<number>(length)

  for (let idx = 0; idx < length; idx++, start += step) {
    range[idx] = start
  }

  return range
}
