/**
 * Returns a shallow copy of the given object containing only the given subset
 * of keys. This is to be thought of as a runtime equivalent of Pick<T, K>
 */
export function pick<T extends object, K extends keyof T>(o: T, ...keys: K[]) {
  const hasProperty = (k: K) => k in o
  const toEntry = (k: K) => [k, o[k]]
  return Object.fromEntries(keys.filter(hasProperty).map(toEntry)) as Pick<T, K>
}
