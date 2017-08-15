import { spawn } from 'child_process'
import { assertNever } from '../fatal-error'

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
  if (shell === Shell.PowerShell) {
    const psCommand = `"Set-Location -LiteralPath '${path}'"`
    await spawn('START', ['powershell', '-NoExit', '-Command', psCommand], {
      shell: true,
      cwd: path,
    })
  } else if (shell === Shell.GitBash) {
    // "C:\Program Files\Git\git-bash.exe" "--cd="C:\YOUR\FOLDER\"
    // const cmd = `cd "${path}"`
    // await spawn(
    //   'START',
    //   [
    //     '%SYSTEMDRIVE%\\Program Files (x86)\\Git\\bin\\sh.exe',
    //     '--login',
    //     '-i',
    //     '-c',
    //     cmd,
    //   ],
    //   { shell: true, cwd: path }
    // )
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
