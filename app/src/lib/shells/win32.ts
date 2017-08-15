import { spawn } from 'child_process'
import { assertNever } from '../fatal-error'
import { readRegistryKeySafe } from '../registry'

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
  const ps = await readRegistryKeySafe(
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\PowerShell'
  )
  const gitBash = await readRegistryKeySafe(
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows'
  )
  console.log('ps', ps)
  console.log('gitBash', gitBash)

  return [Shell.Cmd, Shell.PowerShell, Shell.GitBash]
}

export async function launch(shell: Shell, path: string): Promise<void> {
  if (shell === Shell.PowerShell) {
    const psCommand = `"Set-Location -LiteralPath '${path}'"`
    await spawn('START', ['powershell', '-NoExit', '-Command', psCommand], {
      shell: true,
      cwd: path,
    })
  } else if (shell === Shell.GitBash) {
    await spawn('"%ProgramFiles%\\Git\\git-bash.exe"', [`--cd="${path}"`], {
      shell: true,
      cwd: path,
    })
  } else if (shell === Shell.Cmd) {
    await spawn('START', ['cmd'], { shell: true, cwd: path })
  } else {
    assertNever(shell, `Unknown shell: ${shell}`)
  }
}
