/**
 * Returns a shallow copy of the given object containing only the given subset
 * of keys. This is to be thought of as a runtime equivalent of Pick<T, K>
 */
export const pick = <T extends object, K extends keyof T>(o: T, ...keys: K[]) =>
  Object.fromEntries(keys.map(k => [k, o[k]])) as Pick<T, K>
