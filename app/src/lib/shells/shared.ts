import * as Darwin from './darwin'
import * as Win32 from './win32'
import * as Linux from './linux'

export type Shell = Darwin.Shell | Win32.Shell | Linux.Shell

/** The default shell. */
export const Default = (function() {
  if (__DARWIN__) {
    return Darwin.Default
  } else if (__WIN32__) {
    return Win32.Default
  } else {
    return Linux.Default
  }
})()

let shellCache: ReadonlyArray<Shell> | null = null

/** Parse the label into the specified shell type. */
export function parse(label: string): Shell {
  if (__DARWIN__) {
    return Darwin.parse(label)
  } else if (__WIN32__) {
    return Win32.parse(label)
  } else if (__LINUX__) {
    return Linux.parse(label)
  }

  throw new Error(
    `Platform not currently supported for resolving shells: ${process.platform}`
  )
}

/** Get the shells available for the user. */
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
  } else if (__LINUX__) {
    shellCache = await Linux.getAvailableShells()
    return shellCache
  }

  return Promise.reject(
    `Platform not currently supported for resolving shells: ${process.platform}`
  )
}

/**
 * Launch the given shell or the default shell if the given shell is
 * unavailable.
 */
export async function launchShellOrDefault(shell: Shell, path: string) {
  const available = await getAvailableShells()
  if (available.indexOf(shell) > -1) {
    return launchShell(shell, path)
  } else {
    return launchShell(Default, path)
  }
}

/** Launch the given shell at the path. */
async function launchShell(shell: Shell, path: string) {
  // We have to manually cast the wider `Shell` type into the platform-specific
  // type. This is less than ideal, but maybe the best we can do without
  // platform-specific build targets.
  if (__DARWIN__) {
    return Darwin.launch(shell as Darwin.Shell, path)
  } else if (__WIN32__) {
    return Win32.launch(shell as Win32.Shell, path)
  } else if (__LINUX__) {
    return Linux.launch(shell as Linux.Shell, path)
  }

  return Promise.reject(
    `Platform not currently supported for launching shells: ${process.platform}`
  )
}
