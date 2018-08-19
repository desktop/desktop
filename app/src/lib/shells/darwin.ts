import { spawn, ChildProcess } from 'child_process'
import { assertNever } from '../fatal-error'
import { IFoundShell } from './found-shell'

const appPath: (bundleId: string) => Promise<string> = require('app-path')

export enum Shell {
  Terminal,
  Hyper,
  iTerm2,
  PowerShellCore,
}

const Shells: Array<IFoundShell<Shell>> = [
  { shell: Shell.Terminal, name: 'Terminal', path: '' },
  { shell: Shell.Hyper, name: 'Hyper', path: '' },
  { shell: Shell.iTerm2, name: 'iTerm2', path: '' },
  { shell: Shell.Terminal, name: 'PowerShell Core', path: '' },
]

export const Default = Shells[0]

export function parse(label: string): string {
  const foundShell: IFoundShell<Shell> | Shell =
    Shells.find(shell => shell.name === label) || Default
  return foundShell ? foundShell.name : Default.name
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
  ] = await Promise.all([
    getShellPath(Shell.Terminal),
    getShellPath(Shell.Hyper),
    getShellPath(Shell.iTerm2),
    getShellPath(Shell.PowerShellCore),
  ])

  const shells: Array<IFoundShell<Shell>> = []
  if (terminalPath) {
    shells.push({ shell: Shell.Terminal, path: terminalPath, name: 'Terminal' })
  }

  if (hyperPath) {
    shells.push({ shell: Shell.Hyper, path: hyperPath, name: 'Hyper' })
  }

  if (iTermPath) {
    shells.push({ shell: Shell.iTerm2, path: iTermPath, name: 'iTerm2' })
  }

  if (powerShellCorePath) {
    shells.push({
      shell: Shell.PowerShellCore,
      path: powerShellCorePath,
      name: 'PowerShell Core',
    })
  }

  return shells
}

export function launch(
  foundShell: IFoundShell<Shell>,
  path: string
): ChildProcess {
  const bundleID = getBundleID(foundShell.shell)
  const commandArgs = ['-b', bundleID, path]
  return spawn('open', commandArgs)
}
