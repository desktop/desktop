/**
 * Parse a string into the given (string) enum type. Returns undefined if the
 * enum type provided did not match any of the keys in the enum.
 *
 * Resist the urge to use Object.entries().find() to get this down to a
 * one-liner. I measured it and this is 200x faster and doesn't allocate any
 * unnecessary arrays.
 */
export function parseEnumValue<T>(
  enumObj: Record<string, T>,
  key: string
): T | undefined {
  for (const k in enumObj) {
    if (k === key && Object.prototype.hasOwnProperty.call(enumObj, k)) {
      return enumObj[k]
    }
  }
  return undefined
}
