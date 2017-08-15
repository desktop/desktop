import * as Darwin from './darwin'
import * as Win32 from './win32'

export type Shell = Darwin.Shell | Win32.Shell

let shellCache: ReadonlyArray<Shell> | null = null

export async function getAvailableShells(): Promise<ReadonlyArray<Shell>> {
  if (shellCache) {
    return shellCache
  }

  if (__DARWIN__) {
    shellCache = await Darwin.getAvailableShells()
    return shellCache
  } else if (__WIN32__) {
    shellCache = await Win32.getAvailableShells()
    return shellCache
  }

  return Promise.reject(
    `Platform not currently supported for resolving shells: ${process.platform}`
  )
}
