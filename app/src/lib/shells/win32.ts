import { spawn } from 'child_process'

export enum Shell {}

export async function getAvailableShells(): Promise<ReadonlyArray<Shell>> {
  return []
}

export async function launch(shell: Shell, path: string): Promise<void> {
  await spawn('START', ['cmd'], { shell: true, cwd: path })
}
