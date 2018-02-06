/** Create a copy of an object by merging it with a subset of its properties. */
export function merge<T, K extends keyof T>(obj: T, subset: Pick<T, K>): T {
  const copy = Object.assign({}, obj)
  for (const k in subset) {
    copy[k] = subset[k]
  }
  return copy
}
