import { spawn } from 'child_process'
import { IFoundShell } from './found-shell'

export enum Shell {
  Gnome = 'gnome-terminal',
}

export const Default = Shell.Gnome

export function parse(label: string): Shell {
  return Default
}

export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell<Shell>>
> {
  return [{ shell: Shell.Gnome, path: '/usr/bin/gnome-terminal' }]
}

export async function launch(shell: Shell, path: string): Promise<void> {
  const commandArgs = ['--working-directory', path]
  await spawn('gnome-terminal', commandArgs)
}
