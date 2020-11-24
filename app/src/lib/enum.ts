type StringEnum<T extends string> = {
  [key: string]: T
}

/**
 * Parse a string into the given (string) enum type. Returns undefined if the
 * enum type provided did not match any of the keys in the enum.
 */
export function parseEnumValue<T extends string>(
  enumObj: StringEnum<T>,
  value: string
): T | undefined {
  return Object.values(enumObj).find(v => v === value)
}
