import { spawn } from 'child_process'
import { pathExists } from '../file-system'
import { assertNever } from '../fatal-error'
import { IFoundShell } from './found-shell'

export enum Shell {
  Gnome = 'GNOME Terminal',
  Tilix = 'Tilix',
  Urxvt = 'URxvt',
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
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}

export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell<Shell>>
> {
  const [gnomeTerminalPath, tilixPath, urxvtPath] = await Promise.all([
    getShellPath(Shell.Gnome),
    getShellPath(Shell.Tilix),
    getShellPath(Shell.Urxvt),
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

  return shells
}

export async function launch(
  shell: IFoundShell<Shell>,
  path: string
): Promise<void> {
  // Urxvt requires specific arguments when launched as a command
  if (shell.shell === Shell.Urxvt) {
    // /usr/bin/urxvt -cd /path/to/project/
    const commandArgs = ['-cd', path]
    await spawn(shell.path, commandArgs)
  }

  const commandArgs = ['--working-directory', path]
  await spawn(shell.path, commandArgs)
}
