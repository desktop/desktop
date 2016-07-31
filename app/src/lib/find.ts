export function findIndex<T>(array: ReadonlyArray<T>, pred: (val: T) => boolean): number {
  return (array as T[]).findIndex(pred)
}

export function find<T>(array: ReadonlyArray<T>, pred: (val: T) => boolean): T | undefined {
  return (array as T[]).find(pred)
}
