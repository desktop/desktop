export function pick<T extends object, K extends keyof T>(o: T, ...keys: K[]) {
  const own = (k: K) => Object.prototype.hasOwnProperty.call(o, k)
  const entry = (k: K) => [k, o[k]]
  return Object.fromEntries(keys.filter(own).map(entry)) as Pick<T, K>
}
