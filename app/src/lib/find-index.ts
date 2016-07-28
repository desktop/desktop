export default function findIndex<T>(array: ReadonlyArray<T>, pred: (val: T) => boolean): number {
  return (array as T[]).findIndex(pred)
}
