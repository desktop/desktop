import { spawn } from 'child_process'
import { pathExists } from '../file-system'
import { assertNever } from '../fatal-error'
import { IFoundShell } from './found-shell'

export enum Shell {
  Gnome = 'GNOME Terminal',
  Tilix = 'Tilix',
}

export const Default = Shell.Gnome

export function parse(label: string): Shell {
  if (label === Shell.Gnome) {
    return Shell.Gnome
  }

  if (label === Shell.Tilix) {
    return Shell.Tilix
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
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}

export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell<Shell>>
> {
  const [gnomeTerminalPath, tilixPath] = await Promise.all([
    getShellPath(Shell.Gnome),
    getShellPath(Shell.Tilix),
  ])

  const shells: Array<IFoundShell<Shell>> = []
  if (gnomeTerminalPath) {
    shells.push({ shell: Shell.Gnome, path: gnomeTerminalPath })
  }

  if (tilixPath) {
    shells.push({ shell: Shell.Tilix, path: tilixPath })
  }

  return shells
}

export async function launch(
  shell: IFoundShell<Shell>,
  path: string
): Promise<void> {
  const commandArgs = ['--working-directory', path]
  await spawn(shell.path, commandArgs)
}
