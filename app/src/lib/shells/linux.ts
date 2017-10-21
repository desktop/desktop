import { spawn } from 'child_process'
import * as fs from 'fs'
import { assertNever, fatalError } from '../fatal-error'
import { IFoundShell } from './found-shell'

export enum Shell {
  Gnome = 'gnome-terminal',
  Tilix = 'tilix',
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
  return new Promise<string | null>(resolve => {
    fs.stat(path, err => {
      if (err) {
        resolve(null)
      } else {
        resolve(path)
      }
    })
  })
}

async function getShellPath(shell: Shell): Promise<string | null> {
  switch (shell) {
    case Shell.Gnome:
      return await getPathIfAvailable('/usr/bin/gnome-terminal')
    case Shell.Tilix:
      return await getPathIfAvailable('/usr/bin/tilix')
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
  const shellPath = await getShellPath(shell.shell)

  if (!shellPath) {
    fatalError(`${shell.shell} is not installed`)
    return
  }

  const commandArgs = ['--working-directory', path]
  await spawn(shellPath, commandArgs)
}
