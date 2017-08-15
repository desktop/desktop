import { spawn } from 'child_process'

export enum Shell {
  Cmd = 'cmd',
  PowerShell = 'PowerShell',
  GitBash = 'Git Bash',
}

export const Default = Shell.Cmd

export function parse(label: string): Shell {
  if (label === Shell.Cmd) {
    return Shell.Cmd
  }

  if (label === Shell.PowerShell) {
    return Shell.PowerShell
  }

  if (label === Shell.GitBash) {
    return Shell.GitBash
  }

  return Default
}

export async function getAvailableShells(): Promise<ReadonlyArray<Shell>> {
  return [Shell.Cmd, Shell.PowerShell, Shell.GitBash]
}

export async function launch(shell: Shell, path: string): Promise<void> {
  await spawn('START', ['cmd'], { shell: true, cwd: path })
}
