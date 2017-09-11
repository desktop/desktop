import { spawn } from 'child_process'
import { assertNever } from '../fatal-error'
import { IFoundShell } from './found-shell'

const appPath: (bundleId: string) => Promise<string> = require('app-path')

export enum Shell {
  Terminal = 'Terminal',
  Hyper = 'Hyper',
  iTerm2 = 'iTerm2',
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
  const [terminalPath, hyperPath, iTermPath] = await Promise.all([
    getShellPath(Shell.Terminal),
    getShellPath(Shell.Hyper),
    getShellPath(Shell.iTerm2),
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

  return shells
}

export async function launch(shell: Shell, path: string): Promise<void> {
  const bundleID = getBundleID(shell)
  const commandArgs = ['-b', bundleID, path]
  await spawn('open', commandArgs)
}
