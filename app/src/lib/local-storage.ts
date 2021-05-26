import { parseEnumValue } from './enum'

/**
 * Returns the value for the provided key from local storage interpreted as a
 * boolean or the provided `defaultValue` if the key doesn't exist.
 *
 * @param key local storage entry to find
 * @param defaultValue fallback value if key not found
 */
export function getBoolean(key: string): boolean | undefined
export function getBoolean(key: string, defaultValue: boolean): boolean
export function getBoolean(
  key: string,
  defaultValue?: boolean
): boolean | undefined {
  const value = localStorage.getItem(key)
  if (value === null) {
    return defaultValue
  }

  // NOTE:
  // 'true' and 'false' were acceptable values for controlling feature flags
  // but it required users to set them manually, and were not documented well in
  // the codebase
  // For now we can check these values for compatibility, but we could drop
  // these at some point in the future

  if (value === '1' || value === 'true') {
    return true
  }

  if (value === '0' || value === 'false') {
    return false
  }

  return defaultValue
}

/**
 * Set the provided key in local storage to a boolean value, or update the
 * existing value if a key is already defined.
 *
 * `true` and `false` will be encoded as the string '1' or '0' respectively.
 *
 * @param key local storage entry to update
 * @param value the boolean to set
 */
export function setBoolean(key: string, value: boolean) {
  localStorage.setItem(key, value ? '1' : '0')
}

/**
 * Retrieve a `number` value from a given local storage entry if found, or the
 * provided `defaultValue` if the key doesn't exist or if the value cannot be
 * converted into a number
 *
 * @param key local storage entry to read
 * @param defaultValue fallback value if unable to find key or valid value
 */
export function getNumber(key: string): number | undefined
export function getNumber(key: string, defaultValue: number): number
export function getNumber(
  key: string,
  defaultValue?: number
): number | undefined {
  const numberAsText = localStorage.getItem(key)

  if (numberAsText === null || numberAsText.length === 0) {
    return defaultValue
  }

  const value = parseInt(numberAsText, 10)
  if (isNaN(value)) {
    return defaultValue
  }

  return value
}

/**
 * Set the provided key in local storage to a numeric value, or update the
 * existing value if a key is already defined.
 *
 * Stores the string representation of the number.
 *
 * @param key local storage entry to update
 * @param value the number to set
 */
export function setNumber(key: string, value: number) {
  localStorage.setItem(key, value.toString())
}

/**
 * Retrieve an array of `number` values from a given local
 * storage entry, if found. The array will be empty if the
 * key doesn't exist or if the values cannot be converted
 * into numbers
 *
 * @param key local storage entry to read
 */
export function getNumberArray(key: string): ReadonlyArray<number> {
  return (localStorage.getItem(key) || '')
    .split(NumberArrayDelimiter)
    .map(parseFloat)
    .filter(n => !isNaN(n))
}

/**
 * Set the provided key in local storage to a list of numeric values, or update the
 * existing value if a key is already defined.
 *
 * Stores the string representation of the number, delimited.
 *
 * @param key local storage entry to update
 * @param values the numbers to set
 */
export function setNumberArray(key: string, values: ReadonlyArray<number>) {
  localStorage.setItem(key, values.join(NumberArrayDelimiter))
}

/**
 * Retrieve an array of `string` values from a given local
 * storage entry, if found. The array will be empty if the
 * key doesn't exist or if the values cannot be converted
 * into strings.
 *
 * @param key local storage entry to read
 */
export function getStringArray(key: string): ReadonlyArray<string> {
  const rawData = localStorage.getItem(key) || '[]'

  try {
    const outputArray = JSON.parse(rawData)

    if (!(outputArray instanceof Array)) {
      return []
    }

    if (outputArray.some(element => typeof element !== 'string')) {
      return []
    }

    return outputArray
  } catch (e) {
    return []
  }
}

/**
 * Set the provided key in local storage to a list of string values, or update the
 * existing value if a key is already defined.
 *
 * @param key local storage entry to update
 * @param values the strings to set
 */
export function setStringArray(key: string, values: ReadonlyArray<string>) {
  const rawData = JSON.stringify(values)

  localStorage.setItem(key, rawData)
}

/** Default delimiter for stringifying and parsing arrays of numbers */
const NumberArrayDelimiter = ','

/**
 * Load a (string) enum based on its stored value. See `parseEnumValue` for more
 * details on the conversion. Note that there's no `setEnum` companion method
 * here since callers can just use `localStorage.setItem(key, enumValue)`
 *
 * @param key     The localStorage key to read from
 * @param enumObj The Enum type definition
 */
export function getEnum<T extends string>(
  key: string,
  enumObj: Record<string, T>
): T | undefined {
  const storedValue = localStorage.getItem(key)
  return storedValue === null ? undefined : parseEnumValue(enumObj, storedValue)
}

/**
 * Retrieve an object of type T's value from a given local
 * storage entry, if found. If not found, return undefined.
 *
 * @param key local storage entry to read
 */
export function getObject<T>(key: string): T | undefined {
  const rawData = localStorage.getItem(key)

  if (rawData === null) {
    return
  }

  try {
    return JSON.parse(rawData)
  } catch (e) {
    // If corrupted and can't be parsed, we return undefined.
    return
  }
}

/**
 * Set the provided key in local storage to an object, or update the
 * existing value if a key is already defined.
 *
 * @param key local storage entry to update
 * @param value the object to set
 */
export function setObject(key: string, value: object) {
  const rawData = JSON.stringify(value)
  localStorage.setItem(key, rawData)
}
