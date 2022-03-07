export function pick<T extends object, K extends keyof T>(o: T, ...keys: K[]) {
  const isOwn = (k: K) => Object.prototype.hasOwnProperty.call(o, k)
  const toEntry = (k: K) => [k, o[k]]
  return Object.fromEntries(keys.filter(isOwn).map(toEntry)) as Pick<T, K>
}
