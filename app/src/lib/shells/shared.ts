import * as Darwin from './darwin'
import * as Win32 from './win32'
import * as Linux from './linux'
import { pathExists } from '../file-system'
import { IFoundShell } from './found-shell'
import { ShellError } from './error'

export type Shell = Darwin.Shell | Win32.Shell | Linux.Shell

export type FoundShell = IFoundShell<Shell>

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

let shellCache: ReadonlyArray<FoundShell> | null = null

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
export async function getAvailableShells(): Promise<ReadonlyArray<FoundShell>> {
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

/** Find the given shell or the default if the given shell can't be found. */
export async function findShellOrDefault(shell: Shell): Promise<FoundShell> {
  const available = await getAvailableShells()
  const found = available.find(s => s.shell === shell)
  if (found) {
    return found
  } else {
    return available.find(s => s.shell === Default)!
  }
}

/** Launch the given shell at the path. */
export async function launchShell(shell: FoundShell, path: string) {
  // We have to manually cast the wider `Shell` type into the platform-specific
  // type. This is less than ideal, but maybe the best we can do without
  // platform-specific build targets.
  const exists = await pathExists(shell.path)
  if (!exists) {
    const label = __DARWIN__ ? 'Preferences' : 'Options'
    throw new ShellError(
      `Could not find executable for '${shell.shell}' at path '${shell.path}'.  Please open ${label} and select an available shell.`
    )
  }

  if (__DARWIN__) {
    return Darwin.launch(shell.shell as Darwin.Shell, path)
  } else if (__WIN32__) {
    return Win32.launch(shell.shell as Win32.Shell, path)
  } else if (__LINUX__) {
    return Linux.launch(shell.shell as Linux.Shell, path)
  }

  return Promise.reject(
    `Platform not currently supported for launching shells: ${process.platform}`
  )
}
