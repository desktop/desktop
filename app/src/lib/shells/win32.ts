import { spawn, ChildProcess } from 'child_process'
import * as Path from 'path'
import { assertNever } from '../fatal-error'
import { readRegistryKeySafe } from '../registry'
import { IFoundShell } from './found-shell'

export enum Shell {
  Cmd = 'Command Prompt',
  PowerShell = 'PowerShell',
  Hyper = 'Hyper',
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

  if (label === Shell.Hyper) {
    return Shell.Hyper
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

  const hyper = await readRegistryKeySafe(
    'HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\Hyper\\command'
  )
  if (hyper.length > 0) {
    // Registry key is structured as "{installationPath}\app-x.x.x\Hyper.exe" "%V"

    // Get the pieces in between quotes
    // commandPieces = ['"{installationPath}\app-x.x.x\Hyper.exe"', '"', '{installationPath}\app-x.x.x\Hyper.exe', ...]
    const commandPieces = hyper[0].value.match(/(["'])(.*?)\1/)
    const path = commandPieces
      ? commandPieces[2] // Get path from the pieces when not null
      : process.env.LocalAppData.concat('\\hyper\\Hyper.exe') // Else fall back to the launcher in install root
    shells.push({
      shell: Shell.Hyper,
      path: path,
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
  } else if (shell === Shell.Hyper) {
    const cp = spawn(`"${foundShell.path}"`, [`"${path}"`], {
      shell: true,
      cwd: path,
    })
    addErrorTracing(`Hyper`, cp)
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
