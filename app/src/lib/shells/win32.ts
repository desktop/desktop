import { spawn, ChildProcess } from 'child_process'
import * as Path from 'path'
import { assertNever } from '../fatal-error'
import { readRegistryKeySafe } from '../registry'
import { IFoundShell } from './found-shell'

export enum Shell {
  Cmd = 'Command Prompt',
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

export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell<Shell>>
> {
  const shells = [
    {
      shell: Shell.Cmd,
      path: process.env.comspec || 'C:\\Windows\\System32\\cmd.exe',
    },
  ]

  const powerShell = await readRegistryKeySafe(
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\PowerShell.exe'
  )
  if (powerShell.length > 0) {
    const path = powerShell[0].value.replace(
      /^%SystemRoot%/i,
      process.env.SystemRoot || 'C:\\Windows'
    )
    shells.push({
      shell: Shell.PowerShell,
      path,
    })
  }

  const gitBash = await readRegistryKeySafe(
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows'
  )
  if (gitBash.length > 0) {
    const installPathEntry = gitBash.find(e => e.name === 'InstallPath')
    if (installPathEntry) {
      shells.push({
        shell: Shell.GitBash,
        path: Path.join(installPathEntry.value, 'git-bash.exe'),
      })
    }
  }

  return shells
}

function addErrorTracing(context: string, cp: ChildProcess) {
  cp.stderr.on('data', chunk => {
    const text = chunk instanceof Buffer ? chunk.toString() : chunk
    log.debug(`[${context}] stderr: '${text}'`)
  })

  cp.on('exit', code => {
    if (code !== 0) {
      log.debug(`[${context}] exit code: ${code}`)
    }
  })
}

export async function launch(
  foundShell: IFoundShell<Shell>,
  path: string
): Promise<void> {
  const shell = foundShell.shell

  if (shell === Shell.PowerShell) {
    const psCommand = `"Set-Location -LiteralPath '${path}'"`
    const cp = spawn(
      'START',
      ['powershell', '-NoExit', '-Command', psCommand],
      {
        shell: true,
        cwd: path,
      }
    )
    addErrorTracing(`PowerShell`, cp)
  } else if (shell === Shell.GitBash) {
    const cp = spawn(`"${foundShell.path}"`, [`--cd="${path}"`], {
      shell: true,
      cwd: path,
    })
    addErrorTracing(`Git Bash`, cp)
  } else if (shell === Shell.Cmd) {
    const cp = spawn('START', ['cmd'], { shell: true, cwd: path })
    addErrorTracing(`CMD`, cp)
  } else {
    assertNever(shell, `Unknown shell: ${shell}`)
  }
}
