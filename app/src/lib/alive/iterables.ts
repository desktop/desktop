export function* eachSlice<T>(values: T[], size: number): Iterable<T[]> {
  for (let i = 0; i < values.length; i += size) {
    yield values.slice(i, i + size)
  }
}

export function* filterMap<T, U>(
  items: T[],
  map: (item: T) => U | null | undefined
): Iterable<U> {
  for (const item of items) {
    const value = map(item)
    if (value != null) {
      yield value
    }
  }
}
