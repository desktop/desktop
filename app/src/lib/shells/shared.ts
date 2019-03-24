import { ChildProcess } from 'child_process'
import { pathExists } from 'fs-extra'

import * as Darwin from './darwin'
import * as Win32 from './win32'
import * as Linux from './linux'
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

/** (Mac Only) Launch Xcode at the path */
export async function launchXcode(
  shell: FoundShell,
  path: string,
  onError: (error: Error) => void
): Promise<void> {
  const exists = await pathExists(shell.path)
  if (!exists) {
    const label = __DARWIN__ ? 'Preferences' : 'Options'
    throw new ShellError(
      `Could not find executable for '${shell.shell}' at path '${
        shell.path
      }'.  Please open ${label} and select an available shell.`
    )
  }
  if (__DARWIN__) {
    cp = Darwin.launch(shell as IFoundShell<Darwin.Shell>, path, '-a', true)
  } else {
    throw new ShellError('Could not run on Non-Darwin sysyems.')
  }
  let cp: ChildProcess | null = null
  if (cp != null) {
    addErrorTracing(shell.shell, cp, onError)
    return Promise.resolve()
  } else {
    return Promise.reject(
      `Platform not currently supported for launching shells: ${
        process.platform
      }`
    )
  }
}

/** Launch the given shell at the path. */
export async function launchShell(
  shell: FoundShell,
  path: string,
  onError: (error: Error) => void
): Promise<void> {
  // We have to manually cast the wider `Shell` type into the platform-specific
  // type. This is less than ideal, but maybe the best we can do without
  // platform-specific build targets.
  const exists = await pathExists(shell.path)
  if (!exists) {
    const label = __DARWIN__ ? 'Preferences' : 'Options'
    throw new ShellError(
      `Could not find executable for '${shell.shell}' at path '${
        shell.path
      }'.  Please open ${label} and select an available shell.`
    )
  }

  let cp: ChildProcess | null = null

  if (__DARWIN__) {
    cp = Darwin.launch(shell as IFoundShell<Darwin.Shell>, path, '-b', false)
  } else if (__WIN32__) {
    cp = Win32.launch(shell as IFoundShell<Win32.Shell>, path)
  } else if (__LINUX__) {
    cp = Linux.launch(shell as IFoundShell<Linux.Shell>, path)
  }

  if (cp != null) {
    addErrorTracing(shell.shell, cp, onError)
    return Promise.resolve()
  } else {
    return Promise.reject(
      `Platform not currently supported for launching shells: ${
        process.platform
      }`
    )
  }
}

function addErrorTracing(
  shell: Shell,
  cp: ChildProcess,
  onError: (error: Error) => void
) {
  cp.stderr.on('data', chunk => {
    const text = chunk instanceof Buffer ? chunk.toString() : chunk
    log.debug(`[${shell}] stderr: '${text}'`)
  })

  cp.on('error', err => {
    log.debug(`[${shell}] an error was encountered`, err)
    onError(err)
  })

  cp.on('exit', code => {
    if (code !== 0) {
      log.debug(`[${shell}] exit code: ${code}`)
    }
  })
}
