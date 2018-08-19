import { spawn, ChildProcess } from 'child_process'
import { pathExists } from 'fs-extra'
import { assertNever } from '../fatal-error'
import { IFoundShell } from './found-shell'

export enum Shell {
  Gnome,
  Tilix,
  Urxvt,
  Konsole,
  Xterm,
}

export const Shells: Array<IFoundShell<Shell>> = [
  { shell: Shell.Gnome, name: 'GNOME Terminal', path: '' },
  { shell: Shell.Tilix, name: 'Tilix', path: '' },
  { shell: Shell.Urxvt, name: 'Urxvt', path: '' },
  { shell: Shell.Konsole, name: 'Konsole', path: '' },
  { shell: Shell.Xterm, name: 'Xterm', path: '' },
]

export const Default = Shells[0]

export function parse(label: string): string {
  const foundShell: IFoundShell<Shell> | Shell =
    Shells.find(shell => shell.name === label) || Default
  return foundShell ? foundShell.name : Default.name
}
async function getPathIfAvailable(path: string): Promise<string | null> {
  return (await pathExists(path)) ? path : null
}

function getShellPath(shell: Shell): Promise<string | null> {
  switch (shell) {
    case Shell.Gnome:
      return getPathIfAvailable('/usr/bin/gnome-terminal')
    case Shell.Tilix:
      return getPathIfAvailable('/usr/bin/tilix')
    case Shell.Urxvt:
      return getPathIfAvailable('/usr/bin/urxvt')
    case Shell.Konsole:
      return getPathIfAvailable('/usr/bin/konsole')
    case Shell.Xterm:
      return getPathIfAvailable('/usr/bin/xterm')
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}

export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell<Shell>>
> {
  const [
    gnomeTerminalPath,
    tilixPath,
    urxvtPath,
    konsolePath,
    xtermPath,
  ] = await Promise.all([
    getShellPath(Shell.Gnome),
    getShellPath(Shell.Tilix),
    getShellPath(Shell.Urxvt),
    getShellPath(Shell.Konsole),
    getShellPath(Shell.Xterm),
  ])

  const shells: Array<IFoundShell<Shell>> = []
  if (gnomeTerminalPath) {
    shells.push({
      shell: Shell.Gnome,
      path: gnomeTerminalPath,
      name: 'GNOME Terminal',
    })
  }

  if (tilixPath) {
    shells.push({ shell: Shell.Tilix, path: tilixPath, name: 'Tilix' })
  }

  if (urxvtPath) {
    shells.push({ shell: Shell.Urxvt, path: urxvtPath, name: 'Urxvt' })
  }

  if (konsolePath) {
    shells.push({ shell: Shell.Konsole, path: konsolePath, name: 'Konsole' })
  }

  if (xtermPath) {
    shells.push({ shell: Shell.Xterm, path: xtermPath, name: 'Xterm' })
  }

  return shells
}

export function launch(
  foundShell: IFoundShell<Shell>,
  path: string
): ChildProcess {
  const shell = foundShell.shell
  switch (shell) {
    case Shell.Urxvt:
      return spawn(foundShell.path, ['-cd', path])
    case Shell.Konsole:
      return spawn(foundShell.path, ['--workdir', path])
    case Shell.Xterm:
      return spawn(foundShell.path, ['-e', '/bin/bash'], { cwd: path })
    case Shell.Tilix:
    case Shell.Gnome:
      return spawn(foundShell.path, ['--working-directory', path])
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}
