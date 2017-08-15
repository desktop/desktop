import { spawn } from 'child_process'

export enum Shell {
  Gnome = 'Gnome',
}

export const Default = Shell.Gnome

export function parse(label: string): Shell {
  return Default
}

export async function getAvailableShells(): Promise<ReadonlyArray<Shell>> {
  return [Shell.Gnome]
}

export async function launch(shell: Shell, path: string): Promise<void> {
  const commandArgs = ['--working-directory', path]
  await spawn('gnome-terminal', commandArgs, { shell: true })
}
