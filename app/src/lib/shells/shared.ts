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

export async function launchShell(shell: Shell) {
  // We have to manually cast the wider `Shell` type into the platform-specific
  // type. This is less than ideal, but maybe the best we can do without
  // platform-specific build targets.
  if (__DARWIN__) {
    return Darwin.launch(shell as Darwin.Shell)
  } else if (__WIN32__) {
    return Win32.launch(shell as Win32.Shell)
  }

  return Promise.reject(
    `Platform not currently supported for launching shells: ${process.platform}`
  )
}
