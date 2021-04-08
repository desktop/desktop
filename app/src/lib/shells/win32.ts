import { spawn, ChildProcess } from 'child_process'
import * as Path from 'path'
import { enumerateValues, HKEY, RegistryValueType } from 'registry-js'
import { pathExists } from 'fs-extra'

import { assertNever } from '../fatal-error'
import { IFoundShell } from './found-shell'
import { enableWSLDetection } from '../feature-flag'
import { findGitOnPath } from '../is-git-on-path'
import { parseEnumValue } from '../enum'

export enum Shell {
  Cmd = 'Command Prompt',
  PowerShell = 'PowerShell',
  PowerShellCore = 'PowerShell Core',
  Hyper = 'Hyper',
  GitBash = 'Git Bash',
  Cygwin = 'Cygwin',
  WSL = 'WSL',
  WindowTerminal = 'Windows Terminal',
  Alacritty = 'Alacritty',
}

export const Default = Shell.Cmd

export function parse(label: string): Shell {
  return parseEnumValue(Shell, label) ?? Default
}

export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell<Shell>>
> {
  const gitPath = await findGitOnPath()
  const shells: IFoundShell<Shell>[] = [
    {
      shell: Shell.Cmd,
      path: process.env.comspec || 'C:\\Windows\\System32\\cmd.exe',
      extraArgs: gitPath ? ['/K', `"doskey git=^"${gitPath}^" $*"`] : [],
    },
  ]

  const powerShellPath = await findPowerShell()
  if (powerShellPath != null) {
    shells.push({
      shell: Shell.PowerShell,
      path: powerShellPath,
    })
  }

  const powerShellCorePath = await findPowerShellCore()
  if (powerShellCorePath != null) {
    shells.push({
      shell: Shell.PowerShellCore,
      path: powerShellCorePath,
    })
  }

  const hyperPath = await findHyper()
  if (hyperPath != null) {
    shells.push({
      shell: Shell.Hyper,
      path: hyperPath,
    })
  }

  const gitBashPath = await findGitBash()
  if (gitBashPath != null) {
    shells.push({
      shell: Shell.GitBash,
      path: gitBashPath,
    })
  }

  const cygwinPath = await findCygwin()
  if (cygwinPath != null) {
    shells.push({
      shell: Shell.Cygwin,
      path: cygwinPath,
    })
  }

  if (enableWSLDetection()) {
    const wslPath = await findWSL()
    if (wslPath != null) {
      shells.push({
        shell: Shell.WSL,
        path: wslPath,
      })
    }
  }

  const alacrittyPath = await findAlacritty()
  if (alacrittyPath != null) {
    shells.push({
      shell: Shell.Alacritty,
      path: alacrittyPath,
    })
  }

  const windowsTerminal = await findWindowsTerminal()
  if (windowsTerminal != null) {
    shells.push({
      shell: Shell.WindowTerminal,
      path: windowsTerminal,
    })
  }
  return shells
}

async function findPowerShell(): Promise<string | null> {
  const powerShell = enumerateValues(
    HKEY.HKEY_LOCAL_MACHINE,
    'Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\PowerShell.exe'
  )

  if (powerShell.length === 0) {
    return null
  }

  const first = powerShell[0]

  // NOTE:
  // on Windows 7 these are both REG_SZ, which technically isn't supposed
  // to contain unexpanded references to environment variables. But given
  // it's also %SystemRoot% and we do the expanding here I think this is
  // a fine workaround to do to support the maximum number of setups.

  if (
    first.type === RegistryValueType.REG_EXPAND_SZ ||
    first.type === RegistryValueType.REG_SZ
  ) {
    const path = first.data.replace(
      /^%SystemRoot%/i,
      process.env.SystemRoot || 'C:\\Windows'
    )

    if (await pathExists(path)) {
      return path
    } else {
      log.debug(
        `[PowerShell] registry entry found but does not exist at '${path}'`
      )
    }
  }

  return null
}

async function findPowerShellCore(): Promise<string | null> {
  const powerShellCore = enumerateValues(
    HKEY.HKEY_LOCAL_MACHINE,
    'Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\pwsh.exe'
  )

  if (powerShellCore.length === 0) {
    return null
  }

  const first = powerShellCore[0]
  if (first.type === RegistryValueType.REG_SZ) {
    const path = first.data

    if (await pathExists(path)) {
      return path
    } else {
      log.debug(
        `[PowerShellCore] registry entry found but does not exist at '${path}'`
      )
    }
  }

  return null
}

async function findHyper(): Promise<string | null> {
  const hyper = enumerateValues(
    HKEY.HKEY_CURRENT_USER,
    'Software\\Classes\\Directory\\Background\\shell\\Hyper\\command'
  )

  if (hyper.length === 0) {
    return null
  }

  const first = hyper[0]
  if (first.type === RegistryValueType.REG_SZ) {
    // Registry key is structured as "{installationPath}\app-x.x.x\Hyper.exe" "%V"

    // This regex is designed to get the path to the version-specific Hyper.
    // commandPieces = ['"{installationPath}\app-x.x.x\Hyper.exe"', '"', '{installationPath}\app-x.x.x\Hyper.exe', ...]
    const commandPieces = first.data.match(/(["'])(.*?)\1/)
    const localAppData = process.env.LocalAppData

    const path = commandPieces
      ? commandPieces[2]
      : localAppData != null
      ? localAppData.concat('\\hyper\\Hyper.exe')
      : null // fall back to the launcher in install root

    if (path == null) {
      log.debug(
        `[Hyper] LOCALAPPDATA environment variable is unset, aborting fallback behavior`
      )
    } else if (await pathExists(path)) {
      return path
    } else {
      log.debug(`[Hyper] registry entry found but does not exist at '${path}'`)
    }
  }

  return null
}

async function findGitBash(): Promise<string | null> {
  const registryPath = enumerateValues(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\GitForWindows'
  )

  if (registryPath.length === 0) {
    return null
  }

  const installPathEntry = registryPath.find(e => e.name === 'InstallPath')
  if (installPathEntry && installPathEntry.type === RegistryValueType.REG_SZ) {
    const path = Path.join(installPathEntry.data, 'git-bash.exe')

    if (await pathExists(path)) {
      return path
    } else {
      log.debug(
        `[Git Bash] registry entry found but does not exist at '${path}'`
      )
    }
  }

  return null
}

async function findCygwin(): Promise<string | null> {
  const registryPath64 = enumerateValues(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\Cygwin\\setup'
  )
  const registryPath32 = enumerateValues(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\WOW6432Node\\Cygwin\\setup'
  )

  if (registryPath64 == null || registryPath32 == null) {
    return null
  }

  const installPathEntry64 = registryPath64.find(e => e.name === 'rootdir')
  const installPathEntry32 = registryPath32.find(e => e.name === 'rootdir')
  if (
    installPathEntry64 &&
    installPathEntry64.type === RegistryValueType.REG_SZ
  ) {
    const path = Path.join(installPathEntry64.data, 'bin\\mintty.exe')

    if (await pathExists(path)) {
      return path
    } else if (
      installPathEntry32 &&
      installPathEntry32.type === RegistryValueType.REG_SZ
    ) {
      const path = Path.join(installPathEntry32.data, 'bin\\mintty.exe')
      if (await pathExists(path)) {
        return path
      }
    } else {
      log.debug(`[Cygwin] registry entry found but does not exist at '${path}'`)
    }
  }

  return null
}

async function findWSL(): Promise<string | null> {
  const system32 = Path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32'
  )
  const wslPath = Path.join(system32, 'wsl.exe')
  const wslConfigPath = Path.join(system32, 'wslconfig.exe')

  if (!(await pathExists(wslPath))) {
    log.debug(`[WSL] wsl.exe does not exist at '${wslPath}'`)
    return null
  }
  if (!(await pathExists(wslConfigPath))) {
    log.debug(
      `[WSL] found wsl.exe, but wslconfig.exe does not exist at '${wslConfigPath}'`
    )
    return null
  }
  const exitCode = new Promise<number>((resolve, reject) => {
    const wslDistros = spawn(wslConfigPath, ['/list'])
    wslDistros.on('error', reject)
    wslDistros.on('exit', resolve)
  })

  try {
    const result = await exitCode
    if (result !== 0) {
      log.debug(
        `[WSL] found wsl.exe and wslconfig.exe, but no distros are installed. Error Code: ${result}`
      )
      return null
    }
    return wslPath
  } catch (err) {
    log.error(`[WSL] unhandled error when invoking 'wsl /list'`, err)
  }
  return null
}

async function findAlacritty(): Promise<string | null> {
  const registryPath = enumerateValues(
    HKEY.HKEY_CLASSES_ROOT,
    'Directory\\Background\\shell\\Open Alacritty here'
  )

  if (registryPath.length === 0) {
    return null
  }

  const alacritty = registryPath.find(e => e.name === 'Icon')
  if (alacritty && alacritty.type === RegistryValueType.REG_SZ) {
    const path = alacritty.data
    if (await pathExists(path)) {
      return path
    } else {
      log.debug(
        `[Alacritty] registry entry found but does not exist at '${path}'`
      )
    }
  }

  return null
}

async function findWindowsTerminal(): Promise<string | null> {
  // Windows Terminal has a link at
  // C:\Users\<User>\AppData\Local\Microsoft\WindowsApps\wt.exe
  const localAppData = process.env.LocalAppData
  if (localAppData != null) {
    const windowsTerminalpath = Path.join(
      localAppData,
      '\\Microsoft\\WindowsApps\\wt.exe'
    )
    if (await pathExists(windowsTerminalpath)) {
      return windowsTerminalpath
    } else {
      log.debug(
        `[Windows Terminal] wt.exe doest not exist at '${windowsTerminalpath}'`
      )
    }
  }
  return null
}

export function launch(
  foundShell: IFoundShell<Shell>,
  path: string
): ChildProcess {
  const shell = foundShell.shell

  switch (shell) {
    case Shell.PowerShell:
      return spawn('START', ['"PowerShell"', `"${foundShell.path}"`], {
        shell: true,
        cwd: path,
      })
    case Shell.PowerShellCore:
      return spawn(
        'START',
        [
          '"PowerShell Core"',
          `"${foundShell.path}"`,
          '-WorkingDirectory',
          `"${path}"`,
        ],
        {
          shell: true,
          cwd: path,
        }
      )
    case Shell.Hyper:
      const hyperPath = `"${foundShell.path}"`
      log.info(`launching ${shell} at path: ${hyperPath}`)
      return spawn(hyperPath, [`"${path}"`], {
        shell: true,
        cwd: path,
      })
    case Shell.Alacritty:
      const alacrittyPath = `"${foundShell.path}"`
      log.info(`launching ${shell} at path: ${alacrittyPath}`)
      return spawn(alacrittyPath, [`--working-directory "${path}"`], {
        shell: true,
        cwd: path,
      })
    case Shell.GitBash:
      const gitBashPath = `"${foundShell.path}"`
      log.info(`launching ${shell} at path: ${gitBashPath}`)
      return spawn(gitBashPath, [`--cd="${path}"`], {
        shell: true,
        cwd: path,
      })
    case Shell.Cygwin:
      const cygwinPath = `"${foundShell.path}"`
      log.info(`launching ${shell} at path: ${cygwinPath}`)
      return spawn(
        cygwinPath,
        [`/bin/sh -lc 'cd "$(cygpath "${path}")"; exec bash`],
        {
          shell: true,
          cwd: path,
        }
      )
    case Shell.WSL:
      return spawn('START', ['"WSL"', `"${foundShell.path}"`], {
        shell: true,
        cwd: path,
      })
    case Shell.Cmd:
      return spawn(
        'START',
        ['"Command Prompt"', `"${foundShell.path}"`, ...foundShell.extraArgs!],
        {
          shell: true,
          cwd: path,
        }
      )
    case Shell.WindowTerminal:
      const windowsTerminalPath = `"${foundShell.path}"`
      log.info(`launching ${shell} at path: ${windowsTerminalPath}`)
      return spawn(windowsTerminalPath, ['-d .'], { shell: true, cwd: path })
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}
