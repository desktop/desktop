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
  WslBash = 'WSL Bash (distro)',
  WslBashDefault = 'WSL Bash (Default)',
}

const WslShells: Array<IFoundShell<Shell>> = []

export const Default: string = Shell.Cmd

export async function preProcessShellData() {
  await enumerateWslShellNames()
}

export function parse(label: string): string {
  if (label === Shell.Cmd) {
    return Shell.Cmd
  }

  if (label === Shell.PowerShell) {
    return Shell.PowerShell
  }

  if (label === Shell.PowerShellCore) {
    return Shell.PowerShellCore
  }

  if (label === Shell.Hyper) {
    return Shell.Hyper
  }

  if (label === Shell.GitBash) {
    return Shell.GitBash
  }

  if (label === Shell.WslBashDefault) {
    return Shell.WslBashDefault
  }

  if (label.search('WSL Bash') === 0) {
    const foundShell: IFoundShell<Shell> | undefined = WslShells.find(
      shell => shell.name === label
    )

    if (foundShell) {
      return foundShell.name
    }
  }

  return Default
}

export async function getAvailableShells(): Promise<Array<IFoundShell<Shell>>> {
  const shells = [
    {
      shell: Shell.Cmd,
      path: process.env.comspec || 'C:\\Windows\\System32\\cmd.exe',
      name: 'Command Prompt',
    },
  ]

  const powerShellPath = await findPowerShell()
  if (powerShellPath != null) {
    shells.push({
      shell: Shell.PowerShell,
      path: powerShellPath,
      name: 'PowerShell',
    })
  }

  const powerShellCorePath = await findPowerShellCore()
  if (powerShellCorePath != null) {
    shells.push({
      shell: Shell.PowerShellCore,
      path: powerShellCorePath,
      name: 'PowerShell Core',
    })
  }

  const hyperPath = await findHyper()
  if (hyperPath != null) {
    shells.push({
      shell: Shell.Hyper,
      path: hyperPath,
      name: 'Hyper',
    })
  }

  const gitBashPath = await findGitBash()
  if (gitBashPath != null) {
    shells.push({
      shell: Shell.GitBash,
      path: gitBashPath,
      name: 'Git Bash',
    })
  }

  const wslBashPaths = await findWslBashShells()
  if (wslBashPaths != null) {
    wslBashPaths.forEach(function(shell) {
      shells.push({
        shell: shell.shell,
        path: shell.path,
        name: shell.name,
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

async function processKeys(keys: string[]): Promise<void> {
  keys.forEach(async function(key) {
    const path = enumerateValues(HKEY.HKEY_CURRENT_USER, key)

    if (path) {
      const distributionName = path.find(e => e.name === 'DistributionName')
      const basePath = path.find(e => e.name === 'BasePath')

      if (
        basePath &&
        basePath.type === RegistryValueType.REG_SZ &&
        distributionName &&
        distributionName.type === RegistryValueType.REG_SZ
      ) {
        const path = Path.join(
          `${basePath.data}`,
          `${distributionName.data}${'.exe'}`
        )

        if (await pathExists(path)) {
          WslShells.push({
            shell: Shell.WslBash,
            name: `WSL Bash (${distributionName.data})`,
            path: path,
          })
        } else {
          const defaultInstallPath = Path.join(
            process.env.HOME + '\\AppData\\Local\\Microsoft\\WindowsApps\\',
            distributionName.data + '.exe'
          )
          if (await pathExists(defaultInstallPath)) {
            WslShells.push({
              shell: Shell.WslBash,
              name: `WSL Bash (${distributionName.data})`,
              path: defaultInstallPath,
            })
          }
        }
      }
    }
  })
}

async function enumerateWslShellNames(): Promise<void> {
  const promise = new Promise<void>(resolve => {
    const hkeyCurrentUser = 'HKEY_CURRENT_USER'
    const keyPath = `${hkeyCurrentUser}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Lxss`
    // forced to used reg.exe to enumerate folder names as registry-js doesnt support folders
    const windowsRoot = process.env.SystemRoot || 'C:\\Windows'
    const windowsSystem32 = windowsRoot + '\\System32\\'
    const defaultRegExe = windowsSystem32 + 'reg.exe'
    const ls = spawn(defaultRegExe, ['query', `${keyPath}`])

    const wslKeys: string[] = []

    ls.stdout.on('data', async data => {
      const strData = data.toString()
      console.log(strData)
      const splitData = strData.split('\n')
      if (splitData) {
        for (let i = 0; i < splitData.length; i++) {
          const str = splitData[i]

          if (str.search('DefaultDistribution') !== -1) {
            continue
          }

          if (str.search('{') !== -1 && str.search('}') !== -1) {
            let key = str.replace(`${hkeyCurrentUser}\\`, '')
            key = key.replace('\r', '')
            wslKeys.push(key)
          }
        }
        await processKeys(wslKeys)
      }
    })
    resolve()
  })

  return await promise
}

async function findWslBashShellsCommandLine(): Promise<ReadonlyArray<
  IFoundShell<Shell>
> | null> {
  const promise = new Promise<IFoundShell<Shell>[] | null>(resolve => {
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
        .replace(' ', '')
        .trim()

      if (trimmedData) {
        //user might have installed WLS but have no valid distro's installed
        if (trimmedData.search('no installed') === -1) {
          const wslShellsNames = trimmedData.split('\n')
          if (wslShellsNames.length > 0) {
            //ignore first line
            for (let i = 1; i < wslShellsNames.length; i++) {
              let wslShellName = wslShellsNames[i]
              wslShellName = wslShellName
                .replace(/[^A-Za-z 0-9()]*/g, '')
                .replace('(Default)', '')
                .trim()
              const wslShell = WslShells.find(
                e => e.name === `WSL Bash (${wslShellName})`
              )

              if (wslShell) {
                shells.push({
                  shell: Shell.WslBash,
                  name: wslShell.name,
                  path: wslShell.path ? wslShell.path : '',
                })
              }
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
      log.info(`launching ${foundShell.name} at path: ${hyperPath}`)
      return spawn(hyperPath, [`"${path}"`], {
        shell: true,
        cwd: path,
      })
    case Shell.GitBash:
      const gitBashPath = `"${foundShell.path}"`
      log.info(`launching ${foundShell.name} at path: ${gitBashPath}`)
      return spawn(gitBashPath, [`--cd="${path}"`], {
        shell: true,
        cwd: path,
      })
    case Shell.Cmd:
      return spawn('START', ['cmd'], { shell: true, cwd: path })
    case Shell.WslBashDefault:
      log.info(`launching ${foundShell.name}`)
      return spawn('START', ['wsl'], {
        shell: true,
        cwd: path,
      })
    case Shell.WslBash:
      log.info(`launching ${foundShell.name} at path: ${foundShell.path}`)
      return spawn('START', [`"${foundShell.path}"`], {
        shell: true,
        cwd: path,
      })

    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}
