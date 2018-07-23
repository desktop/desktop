import { spawn, ChildProcess } from 'child_process'
import { assertNever } from '../fatal-error'
import { IFoundShell } from './found-shell'

const appPath: (bundleId: string) => Promise<string> = require('app-path')

export enum Shell {
  Terminal = 'Terminal',
  Hyper = 'Hyper',
  iTerm2 = 'iTerm2',
  PowerShellCore = 'PowerShell Core',
  Kitty = 'Kitty',
}

export const Default = Shell.Terminal

export function parse(label: string): Shell {
  if (label === Shell.Terminal) {
    return Shell.Terminal
  }

  if (label === Shell.Hyper) {
    return Shell.Hyper
  }

  if (label === Shell.iTerm2) {
    return Shell.iTerm2
  }

  if (label === Shell.PowerShellCore) {
    return Shell.PowerShellCore
  }

  if (label === Shell.Kitty) {
    return Shell.Kitty
  }

  return Default
}

function getBundleID(shell: Shell): string {
  switch (shell) {
    case Shell.Terminal:
      return 'com.apple.Terminal'
    case Shell.iTerm2:
      return 'com.googlecode.iterm2'
    case Shell.Hyper:
      return 'co.zeit.hyper'
    case Shell.PowerShellCore:
      return 'com.microsoft.powershell'
    case Shell.Kitty:
      return 'net.kovidgoyal.kitty'
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}

async function getShellPath(shell: Shell): Promise<string | null> {
  const bundleId = getBundleID(shell)
  try {
    return await appPath(bundleId)
  } catch (e) {
    // `appPath` will raise an error if it cannot find the program.
    return null
  }
}

export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell<Shell>>
> {
  const [
    terminalPath,
    hyperPath,
    iTermPath,
    powerShellCorePath,
    kittyPath,
  ] = await Promise.all([
    getShellPath(Shell.Terminal),
    getShellPath(Shell.Hyper),
    getShellPath(Shell.iTerm2),
    getShellPath(Shell.PowerShellCore),
    getShellPath(Shell.Kitty),
  ])

  const shells: Array<IFoundShell<Shell>> = []
  if (terminalPath) {
    shells.push({ shell: Shell.Terminal, path: terminalPath })
  }

  if (hyperPath) {
    shells.push({ shell: Shell.Hyper, path: hyperPath })
  }

  if (iTermPath) {
    shells.push({ shell: Shell.iTerm2, path: iTermPath })
  }

  if (powerShellCorePath) {
    shells.push({ shell: Shell.PowerShellCore, path: powerShellCorePath })
  }

  if (kittyPath) {
    shells.push({ shell: Shell.Kitty, path: kittyPath })
  }

  return shells
}

export function launch(
  foundShell: IFoundShell<Shell>,
  path: string
): ChildProcess {
  const bundleID = getBundleID(foundShell.shell)
  const baseArgs = ['-b', bundleID]

  // kitty shell does not handle the path explicitly
  // need to pass in the additional flag
  const commandArgs =
    foundShell.shell === Shell.Kitty ? ['--args', '-d', path] : [path]

  return spawn('open', baseArgs.concat(commandArgs))
}
