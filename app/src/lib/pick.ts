/**
 * Create a copy of obj, copying only the specified properties.
 *
 * This is the runtime equivalent of the Pick<T,K> type.
 */
export function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  const entries = keys.map(k => [k, obj[k]])
  return Object.fromEntries(entries)
}
