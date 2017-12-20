import { spawn } from 'child_process'
import { pathExists } from '../file-system'
import { assertNever } from '../fatal-error'
import { IFoundShell } from './found-shell'

export enum Shell {
  Gnome = 'GNOME Terminal',
  Tilix = 'Tilix',
  Urxvt = 'URxvt',
  Konsole = 'Konsole',
  Xterm = 'XTerm',
}

export const Default = Shell.Gnome

export function parse(label: string): Shell {
  if (label === Shell.Gnome) {
    return Shell.Gnome
  }

  if (label === Shell.Tilix) {
    return Shell.Tilix
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

  return Default
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
    shells.push({ shell: Shell.Gnome, path: gnomeTerminalPath })
  }

  if (tilixPath) {
    shells.push({ shell: Shell.Tilix, path: tilixPath })
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

  return shells
}

export async function launch(
  shell: IFoundShell<Shell>,
  path: string
): Promise<void> {
  if (shell.shell === Shell.Urxvt) {
    const commandArgs = ['-cd', path]
    await spawn(shell.path, commandArgs)
  }

  if (shell.shell === Shell.Konsole) {
    const commandArgs = ['--workdir', path]
    await spawn(shell.path, commandArgs)
  }

  if (shell.shell === Shell.Xterm) {
    const commandArgs = ['-e', '/bin/bash']
    const commandOptions = { cwd: path }
    await spawn(shell.path, commandArgs, commandOptions)
  }

  const commandArgs = ['--working-directory', path]
  await spawn(shell.path, commandArgs)
}
