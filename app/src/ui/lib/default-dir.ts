import * as OS from 'os'

/** The path to the default directory. */
export function getDefaultDir(): string {
  return OS.homedir()
}
