import { spawn, ChildProcess } from 'child_process'
import * as Path from 'path'
import { enumerateValues, HKEY, RegistryValueType } from 'registry-js'
import { pathExists } from 'fs-extra'

import { assertNever } from '../fatal-error'
import { IFoundShell } from './found-shell'

export enum Shell {
  Cmd = 'Command Prompt',
  PowerShell = 'PowerShell',
  PowerShellCore = 'PowerShell Core',
  Hyper = 'Hyper',
  GitBash = 'Git Bash',
  WslBash = 'WSL Bash (Default)',
  WslUbuntu = 'WSL (Ubuntu)',
  WslOpenSuse42 = 'WSL (openSUSE-42)',
  WslDebian = 'WSL (Debian)',
  WslKali = 'WSL (kali-linux)',
  WslSLES = 'WSL (SLES-12)',
}

export const Default = Shell.Cmd

export function parse(label: String): Shell {
  switch (label) {
    case Shell.PowerShell:
      return Shell.PowerShell
    case Shell.PowerShellCore:
      return Shell.PowerShellCore
    case Shell.Hyper:
      return Shell.Hyper
    case Shell.GitBash:
      return Shell.GitBash
    case Shell.WslBash:
      return Shell.WslBash
    case Shell.WslDebian:
      return Shell.WslDebian
    case Shell.WslKali:
      return Shell.WslKali
    case Shell.WslOpenSuse42:
      return Shell.WslOpenSuse42
    case Shell.WslSLES:
      return Shell.WslSLES
    case Shell.WslUbuntu:
      return Shell.WslUbuntu
    case Shell.Cmd:
    default:
      return Default
  }
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

  const wslBashPaths = await findWslBashShells()
  if (wslBashPaths != null) {
    wslBashPaths.forEach(function(shell) {
      shells.push({
        shell: shell.shell,
        path: shell.path,
      })
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

async function findWslBashShellsCommandLine(): Promise<ReadonlyArray<
  IFoundShell<Shell>
> | null> {
  const promise = new Promise<IFoundShell<Shell>[] | null>(resolve => {
    //check we have a valid distro installed (ubuntu, opensuse, sles, kali, debian)
    const windowsRoot = process.env.SystemRoot || 'C:\\Windows'
    const windowsSystem32 = windowsRoot + '\\System32\\'
    const defaultWslExe = windowsSystem32 + 'wsl.exe'

    const shells = [
      {
        shell: Shell.WslBash,
        path: defaultWslExe,
        name: 'WSL Bash (Default)',
      },
    ]
    const wslConfigExe = windowsSystem32 + 'wslconfig.exe'

    const ls = spawn(wslConfigExe, ['/list'])
    ls.stdout.on('data', data => {
      //wslconfig.exe /list returns a unicode array - santise to human readable format
      const trimmedData = data
        .toString()
        .replace(
          /[^A-Za-z 0-9\.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]*/g,
          ''
        )

      //user might have installed WLS but have no valid distro's installed
      if (trimmedData.search('no installed') === -1) {
        const wslShellsNames = trimmedData.split(':')
        if (wslShellsNames.length > 0) {
          //ignore first line
          for (let i = 1; i < wslShellsNames.length; i++) {
            const wslShellNames = wslShellsNames[i].trim()

            //default path for distro exe's
            const wslShellPathWindows =
              process.env.HOME + '\\AppData\\Local\\Microsoft\\WindowsApps\\'

            if (wslShellNames.search('Debian') !== -1) {
              shells.push({
                shell: Shell.WslDebian,
                name: 'debian',
                path: wslShellPathWindows + 'debian.exe',
              })
            }

            if (wslShellNames.search('kali-linux') !== -1) {
              shells.push({
                shell: Shell.WslKali,
                name: 'kali',
                path: wslShellPathWindows + 'kali.exe',
              })
            }

            if (wslShellNames.search('openSUSE-42') !== -1) {
              shells.push({
                shell: Shell.WslOpenSuse42,
                name: 'openSUSE-42',
                path: wslShellPathWindows + 'openSUSE-42.exe',
              })
            }

            if (wslShellNames.search('SLES-12') !== -1) {
              shells.push({
                shell: Shell.WslSLES,
                name: 'SLES-12',
                path: wslShellPathWindows + 'SLES-12.exe',
              })
            }

            if (wslShellNames.search('Ubuntu') !== -1) {
              shells.push({
                shell: Shell.WslUbuntu,
                name: 'ubuntu',
                path: wslShellPathWindows + 'ubuntu.exe',
              })
            }
          }
        }
      }

      resolve(shells)
    })
  })

  return await promise
}

async function findWslBashShells(): Promise<ReadonlyArray<
  IFoundShell<Shell>
> | null> {
  //check windows version numbers
  const windowsVersion = enumerateValues(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
  )

  if (windowsVersion.length === 0) {
    log.debug(`Wsl Bash registry entry for windows version does not exist`)
    return null
  } else {
    //https://msdn.microsoft.com/en-us/library/windows/desktop/ms724832%28v=vs.85%29.aspx?f=255&MSPPError=-2147217396
    const majorVersion = windowsVersion.find(
      e => e.name === 'CurrentMajorVersionNumber'
    )
    //https://en.wikipedia.org/wiki/Windows_10_version_history
    const releaseId = windowsVersion.find(e => e.name === 'ReleaseId')

    const minReleaseId = 1507
    const windowsMajorVersion = 10
    //can check range of release id values to determine exact windows 10 version maxReleaseId will likely increase
    //breaking this check
    if (
      majorVersion &&
      majorVersion.type === RegistryValueType.REG_DWORD &&
      majorVersion.data !== windowsMajorVersion &&
      releaseId &&
      releaseId.type === RegistryValueType.REG_SZ &&
      parseInt(releaseId.data, 10) > minReleaseId
    ) {
      return null
    }
  }

  //check the registry key exists (i.e. its installed)
  const registryPath = enumerateValues(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\Notifications\\OptionalFeatures\\Microsoft-Windows-Subsystem-Linux'
  )

  if (registryPath.length === 0) {
    log.debug(`Wsl Bash registry entry does not exist`)
    return null
  }

  return await findWslBashShellsCommandLine()
}

export function launch(
  foundShell: IFoundShell<Shell>,
  path: string
): ChildProcess {
  const shell = foundShell.shell

  switch (shell) {
    case Shell.PowerShell:
      const psCommand = `"Set-Location -LiteralPath '${path}'"`
      return spawn('START', ['powershell', '-NoExit', '-Command', psCommand], {
        shell: true,
        cwd: path,
      })
    case Shell.PowerShellCore:
      const psCoreCommand = `"Set-Location -LiteralPath '${path}'"`
      return spawn('START', ['pwsh', '-NoExit', '-Command', psCoreCommand], {
        shell: true,
        cwd: path,
      })
    case Shell.Hyper:
      const hyperPath = `"${foundShell.path}"`
      log.info(`launching ${shell} at path: ${hyperPath}`)
      return spawn(hyperPath, [`"${path}"`], {
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
    case Shell.Cmd:
      return spawn('START', ['cmd'], { shell: true, cwd: path })
    case Shell.WslBash:
      log.info(`launching ${foundShell}`)
      return spawn('START', ['wsl'], {
        shell: true,
        cwd: path,
      })
    case Shell.WslUbuntu:
      log.info(`launching ${foundShell} at path: ${foundShell.path}`)
      return spawn('START', ['ubuntu'], {
        shell: true,
        cwd: path,
      })
    case Shell.WslSLES:
      log.info(`launching ${foundShell} at path: ${foundShell.path}`)
      return spawn('START', ['sles-12'], {
        shell: true,
        cwd: path,
      })
    case Shell.WslDebian:
      log.info(`launching ${foundShell} at path: ${foundShell.path}`)
      return spawn('START', ['debian'], {
        shell: true,
        cwd: path,
      })
    case Shell.WslKali:
      log.info(`launching ${foundShell} at path: ${foundShell.path}`)
      return spawn('START', ['kali'], {
        shell: true,
        cwd: path,
      })
    case Shell.WslOpenSuse42:
      log.info(`launching ${foundShell} at path: ${foundShell.path}`)
      return spawn('START', ['opensuse-42'], {
        shell: true,
        cwd: path,
      })

    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}
