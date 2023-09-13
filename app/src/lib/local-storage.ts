import { ImageDiffType } from '../models/diff'
import { parseEnumValue } from './enum'
import { fatalError } from './fatal-error'
import { ILastThankYou } from '../models/last-thank-you'

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
 * Retrieve a integer number value from a given local storage entry if found, or the
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
 * Retrieve a floating point number value from a given local storage entry if
 * found, or the provided `defaultValue` if the key doesn't exist or if the
 * value cannot be converted into a number
 *
 * @param key local storage entry to read
 * @param defaultValue fallback value if unable to find key or valid value
 */
export function getFloatNumber(key: string): number | undefined
export function getFloatNumber(key: string, defaultValue: number): number
export function getFloatNumber(
  key: string,
  defaultValue?: number
): number | undefined {
  const numberAsText = localStorage.getItem(key)

  if (numberAsText === null || numberAsText.length === 0) {
    return defaultValue
  }

  const value = parseFloat(numberAsText)
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

const LocalStorageKeys = [
  'askToMoveToApplicationsFolder',
  'commit-spellcheck-enabled',
  'commit-summary-width',
  'confirmCheckoutCommit',
  'confirmDiscardChanges',
  'confirmDiscardChangesPermanentlyKey',
  'confirmDiscardStash',
  'confirmForcePush',
  'confirmRepoRemoval',
  'confirmUndoCommit',
  'externalEditor',
  'hide-whitespace-in-changes-diff',
  'hide-whitespace-in-diff',
  'hide-whitespace-in-pull-request-diff',
  'image-diff-type',
  'last-selected-repository-id',
  'version-and-users-of-last-thank-you',
  'pull-request-files-width',
  'pull-request-suggested-next-action-key',
  'recently-selected-repositories',
  'enable-repository-indicators',
  'showCommitLengthWarning',
  'shell',
  'sidebar-width',
  'stashed-files-width',
  'uncommittedChangesStrategyKind',
] as const

export type LocalStorageKey = typeof LocalStorageKeys[number]

const LocalStorageDefaults: Record<
  LocalStorageKey,
  boolean | number | object | null
> = {
  askToMoveToApplicationsFolder: true,
  'commit-spellcheck-enabled': true,
  'commit-summary-width': 250,
  confirmCheckoutCommit: true,
  confirmDiscardChanges: true,
  confirmDiscardChangesPermanentlyKey: true,
  confirmDiscardStash: true,
  confirmForcePush: true,
  confirmRepoRemoval: true,
  confirmUndoCommit: true,
  externalEditor: null,
  'hide-whitespace-in-changes-diff': false,
  'hide-whitespace-in-diff': false,
  'hide-whitespace-in-pull-request-diff': false,
  'image-diff-type': ImageDiffType.TwoUp,
  'last-selected-repository-id': 0,
  'version-and-users-of-last-thank-you': null,
  'pull-request-files-width': 250,
  'pull-request-suggested-next-action-key': 0,
  'recently-selected-repositories': 0,
  'enable-repository-indicators': 0,
  showCommitLengthWarning: false,
  shell: 0,
  'sidebar-width': 250,
  'stashed-files-width': 250,
  uncommittedChangesStrategyKind: 0,
}

export class LocalStorageManager {
  private readonly storage = new Map<
    string,
    boolean | string | object | number | null
  >()

  public constructor() {
    this.intialize()
  }

  public get<T extends typeof LocalStorageDefaults[LocalStorageKey]>(
    key: LocalStorageKey
  ): T {
    const value = this.storage.get(key)

    if (value === undefined) {
      fatalError(`Unknown key: ${key}`)
    }

    if (typeof value !== typeof LocalStorageDefaults[key]) {
      fatalError(`Incorrect Type: ${key}`)
    }

    // Not sure if this casting is safe..
    return value as T
  }

  public set(key: LocalStorageKey, value: boolean | string | object | number) {
    switch (typeof value) {
      case 'boolean':
        setBoolean(key, value)
        break
      case 'number':
        setNumber(key, value)
        break
      case 'object':
        setObject(key, value)
        break
      default:
        fatalError(`Unexpected default value type: ${typeof value}`)
    }

    this.storage.set(key, value)
  }

  private intialize() {
    this.applySchema()

    LocalStorageKeys.forEach(key => {
      this.initializeValue(key)
    })
  }

  /**
   * We are implementing a versioning of our localStorage config so that we can
   * migrate new users to new app defaults while keeping existing users on their
   * current configuration. Starting the versioning at 1.
   *
   * Another way to say this, is this provides a way to override the default
   * values. If a config is not set in this versioning, the user will receive the
   * default values defined in `LocalStorageDefaults`
   */
  private applySchema() {
    const latestSchemaVersion = 1

    // If config version doesn't exist (new installation), set it to the latest.
    if (getNumber('config-version') === undefined) {
      setNumber('config-version', latestSchemaVersion)
    }

    const userConfig = getNumber('config-version', latestSchemaVersion)

    if (userConfig <= 1) {
      this.overrideValue('enable-repository-indicators', true)
      this.overrideValue('showCommitLengthWarning', true)
    }
  }

  private overrideValue(
    key: LocalStorageKey,
    value: boolean | string | object | number
  ) {
    switch (typeof value) {
      case 'boolean':
        if (getBoolean(key) === undefined) {
          setBoolean(key, value)
        }
        break
      case 'number':
        if (getNumber(key) === undefined) {
          setNumber(key, value)
        }
        break
      case 'object':
        if (getObject(key) === undefined) {
          setObject(key, value)
        }
        break
      default:
        fatalError(`Unexpected default value type: ${typeof value}`)
    }
  }

  private initializeValue(key: LocalStorageKey) {
    const defaultValue: boolean | number | object | null =
      LocalStorageDefaults[key]

    switch (typeof defaultValue) {
      case 'boolean':
        const booleanValue = getBoolean(key, defaultValue)
        this.storage.set(key, booleanValue)
        break
      case 'number':
        const numberValue = getNumber(key, defaultValue)
        this.storage.set(key, numberValue)
        break
      case 'object':
        this.intializeObjectValue(key, defaultValue)
        break
      default:
        fatalError(`Unexpected default value type: ${typeof defaultValue}`)
    }
  }

  private intializeObjectValue(
    key: LocalStorageKey,
    defaultValue: object | null
  ) {
    if (key === 'image-diff-type') {
      const imageDiffTypeStoredValue = localStorage.getItem(key)
      const value =
        imageDiffTypeStoredValue === null
          ? defaultValue
          : parseInt(imageDiffTypeStoredValue)
      this.storage.set(key, value)
      return
    }

    if (key === 'version-and-users-of-last-thank-you') {
      const storedValue = getObject<ILastThankYou>(key) ?? null
      this.storage.set(key, storedValue)
      return
    }
  }
}
