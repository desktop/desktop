/**
 * Returns the value for the provided key from local storage interpreted as a
 * boolean or the provided `defaultValue` if the key doesn't exist.
 *
 * @param key local storage entry to find
 * @param defaultValue fallback value if key not found
 */
export function getBoolean(key: string, defaultValue = false): boolean {
  const value = localStorage.getItem(key)
  if (value === null) {
    return defaultValue
  }

  const intValue = parseInt(value, 10)

  if (isNaN(intValue)) {
    return defaultValue
  }

  return intValue === 1
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
 * convered into a number
 *
 * @param key local storage entry to read
 * @param defaultValue fallback value if unable to find key or valid value
 */
export function getNumber(key: string, defaultValue = 0): number {
  const numberAsText = localStorage.getItem(key)
  let value = 0
  if (numberAsText && numberAsText.length > 0) {
    value = parseInt(numberAsText, 10)
  }

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
