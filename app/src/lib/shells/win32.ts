import { spawn } from 'child_process'

export enum Shell {
  Cmd = 'cmd',
}

export const Default = Shell.Cmd

export function parse(label: string): Shell {
  return Default
}

export async function getAvailableShells(): Promise<ReadonlyArray<Shell>> {
  return [Shell.Cmd]
}

export async function launch(shell: Shell, path: string): Promise<void> {
  await spawn('START', ['cmd'], { shell: true, cwd: path })
}
