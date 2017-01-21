import * as OS from 'os'

/** The path to the default directory. */
export function getDefaultDir(): string {
  // TODO: This should be saved and loaded from local storage.
  return OS.homedir()
}
