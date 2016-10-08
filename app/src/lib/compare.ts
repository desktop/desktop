export function compare<T>(x: T, y: T) {
  if (x < y) { return -1 }
  if (x > y) { return 1 }

  return 0
}
