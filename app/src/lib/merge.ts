/** Create a copy of an object by merging it with a subset of its properties. */
export function merge<T extends {}, K extends keyof T>(
  obj: T | null | undefined,
  subset: Pick<T, K>
): T {
  const copy = Object.assign({}, obj)
  for (const k in subset) {
    copy[k] = subset[k]
  }
  return copy
}
