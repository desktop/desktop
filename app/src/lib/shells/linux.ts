import { spawn, ChildProcess } from 'child_process'
import { pathExists } from 'fs-extra'
import { assertNever } from '../fatal-error'
import { IFoundShell } from './found-shell'

export enum Shell {
  Gnome = 'GNOME Terminal',
  Mate = 'MATE Terminal',
  Tilix = 'Tilix',
  Terminator = 'Terminator',
  Urxvt = 'URxvt',
  Konsole = 'Konsole',
  Xterm = 'XTerm',
  Terminology = 'Terminology',
}

export const Default = Shell.Gnome

export function parse(label: string): Shell {
  if (label === Shell.Gnome) {
    return Shell.Gnome
  }

  if (label === Shell.Mate) {
    return Shell.Mate
  }

  if (label === Shell.Tilix) {
    return Shell.Tilix
  }

  if (label === Shell.Terminator) {
    return Shell.Terminator
  }

  if (label === Shell.Urxvt) {
    return Shell.Urxvt
  }

  if (label === Shell.Konsole) {
    return Shell.Konsole
  }

  if (label === Shell.Xterm) {
    return Shell.Xterm
  }

  if (label === Shell.Terminology) {
    return Shell.Terminology
  }

  return Default
}

async function getPathIfAvailable(path: string): Promise<string | null> {
  return (await pathExists(path)) ? path : null
}

function getShellPath(shell: Shell): Promise<string | null> {
  switch (shell) {
    case Shell.Gnome:
      return getPathIfAvailable('/usr/bin/gnome-terminal')
    case Shell.Mate:
      return getPathIfAvailable('/usr/bin/mate-terminal')
    case Shell.Tilix:
      return getPathIfAvailable('/usr/bin/tilix')
    case Shell.Terminator:
      return getPathIfAvailable('/usr/bin/terminator')
    case Shell.Urxvt:
      return getPathIfAvailable('/usr/bin/urxvt')
    case Shell.Konsole:
      return getPathIfAvailable('/usr/bin/konsole')
    case Shell.Xterm:
      return getPathIfAvailable('/usr/bin/xterm')
    case Shell.Terminology:
      return getPathIfAvailable('/usr/bin/terminology')
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}

export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell<Shell>>
> {
  const [
    gnomeTerminalPath,
    mateTerminalPath,
    tilixPath,
    terminatorPath,
    urxvtPath,
    konsolePath,
    xtermPath,
    terminologyPath,
  ] = await Promise.all([
    getShellPath(Shell.Gnome),
    getShellPath(Shell.Mate),
    getShellPath(Shell.Tilix),
    getShellPath(Shell.Terminator),
    getShellPath(Shell.Urxvt),
    getShellPath(Shell.Konsole),
    getShellPath(Shell.Xterm),
    getShellPath(Shell.Terminology),
  ])

  const shells: Array<IFoundShell<Shell>> = []
  if (gnomeTerminalPath) {
    shells.push({ shell: Shell.Gnome, path: gnomeTerminalPath })
  }

  if (mateTerminalPath) {
    shells.push({ shell: Shell.Mate, path: mateTerminalPath })
  }

  if (tilixPath) {
    shells.push({ shell: Shell.Tilix, path: tilixPath })
  }

  if (terminatorPath) {
    shells.push({ shell: Shell.Terminator, path: terminatorPath })
  }

  if (urxvtPath) {
    shells.push({ shell: Shell.Urxvt, path: urxvtPath })
  }

  if (konsolePath) {
    shells.push({ shell: Shell.Konsole, path: konsolePath })
  }

  if (xtermPath) {
    shells.push({ shell: Shell.Xterm, path: xtermPath })
  }

  if (terminologyPath) {
    shells.push({ shell: Shell.Terminology, path: terminologyPath })
  }

  return shells
}

export function launch(
  foundShell: IFoundShell<Shell>,
  path: string
): ChildProcess {
  const shell = foundShell.shell
  switch (shell) {
    case Shell.Gnome:
    case Shell.Mate:
    case Shell.Tilix:
    case Shell.Terminator:
      return spawn(foundShell.path, ['--working-directory', path])
    case Shell.Urxvt:
      return spawn(foundShell.path, ['-cd', path])
    case Shell.Konsole:
      return spawn(foundShell.path, ['--workdir', path])
    case Shell.Xterm:
      return spawn(foundShell.path, ['-e', '/bin/bash'], { cwd: path })
    case Shell.Terminology:
      return spawn(foundShell.path, ['-d', path])
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}
