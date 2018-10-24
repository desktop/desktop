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
 * convered into a number
 *
 * @param key local storage entry to read
 * @param defaultValue fallback value if unable to find key or valid value
 */
export function getNumber(key: string, defaultValue = 0): number {
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
