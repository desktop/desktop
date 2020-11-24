type StringEnum<T extends string> = {
  [key: string]: T
}

/**
 * Parse a string into the given (string) enum type. Returns undefined if the
 * enum type provided did not match any of the keys in the enum.
 *
 * Resist the urge to use Object.entries().find() to get this down to a
 * one-liner. I measured it and this is 200x faster and doesn't allocate any
 * unnecessary arrays.
 */
export function parseEnumValue<T extends string>(
  enumObj: StringEnum<T>,
  value: string
): T | undefined {
  for (const key in enumObj) {
    if (
      Object.prototype.hasOwnProperty.call(enumObj, key) &&
      enumObj[key] === value
    ) {
      return enumObj[key]
    }
  }
  return undefined
}
