import { spawn, ChildProcess } from 'child_process'
import { assertNever } from '../fatal-error'
import appPath from 'app-path'
import { parseEnumValue } from '../enum'
import { FoundShell } from './shared'
import {
  expandTargetPathArgument,
  ICustomIntegration,
  parseCustomIntegrationArguments,
  spawnCustomIntegration,
} from '../custom-integration'

export enum Shell {
  Terminal = 'Terminal',
  Hyper = 'Hyper',
  iTerm2 = 'iTerm2',
  PowerShellCore = 'PowerShell Core',
  Kitty = 'Kitty',
  Alacritty = 'Alacritty',
  Tabby = 'Tabby',
  WezTerm = 'WezTerm',
  Warp = 'Warp',
}

export const Default = Shell.Terminal

export function parse(label: string): Shell {
  return parseEnumValue(Shell, label) ?? Default
}

function getBundleIDs(shell: Shell): ReadonlyArray<string> {
  switch (shell) {
    case Shell.Terminal:
      return ['com.apple.Terminal']
    case Shell.iTerm2:
      return ['com.googlecode.iterm2']
    case Shell.Hyper:
      return ['co.zeit.hyper']
    case Shell.PowerShellCore:
      return ['com.microsoft.powershell']
    case Shell.Kitty:
      return ['net.kovidgoyal.kitty']
    case Shell.Alacritty:
      return ['org.alacritty', 'io.alacritty']
    case Shell.Tabby:
      return ['org.tabby']
    case Shell.WezTerm:
      return ['com.github.wez.wezterm']
    case Shell.Warp:
      return ['dev.warp.Warp-Stable']
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}

async function getShellInfo(
  shell: Shell
): Promise<{ path: string; bundleID: string } | null> {
  const bundleIds = getBundleIDs(shell)
  for (const id of bundleIds) {
    try {
      const path = await appPath(id)
      return { path, bundleID: id }
    } catch (error) {
      log.debug(
        `Unable to locate ${shell} installation with bundle id ${id}`,
        error
      )
    }
  }

  return null
}

export async function getAvailableShells(): Promise<
  ReadonlyArray<FoundShell<Shell>>
> {
  const [
    terminalInfo,
    hyperInfo,
    iTermInfo,
    powerShellCoreInfo,
    kittyInfo,
    alacrittyInfo,
    tabbyInfo,
    wezTermInfo,
    warpInfo,
  ] = await Promise.all([
    getShellInfo(Shell.Terminal),
    getShellInfo(Shell.Hyper),
    getShellInfo(Shell.iTerm2),
    getShellInfo(Shell.PowerShellCore),
    getShellInfo(Shell.Kitty),
    getShellInfo(Shell.Alacritty),
    getShellInfo(Shell.Tabby),
    getShellInfo(Shell.WezTerm),
    getShellInfo(Shell.Warp),
  ])

  const shells: Array<FoundShell<Shell>> = []
  if (terminalInfo) {
    shells.push({ shell: Shell.Terminal, ...terminalInfo })
  }

  if (hyperInfo) {
    shells.push({ shell: Shell.Hyper, ...hyperInfo })
  }

  if (iTermInfo) {
    shells.push({ shell: Shell.iTerm2, ...iTermInfo })
  }

  if (powerShellCoreInfo) {
    shells.push({ shell: Shell.PowerShellCore, ...powerShellCoreInfo })
  }

  if (kittyInfo) {
    const kittyExecutable = `${kittyInfo.path}/Contents/MacOS/kitty`
    shells.push({
      shell: Shell.Kitty,
      path: kittyExecutable,
      bundleID: kittyInfo.bundleID,
    })
  }

  if (alacrittyInfo) {
    const alacrittyExecutable = `${alacrittyInfo.path}/Contents/MacOS/alacritty`
    shells.push({
      shell: Shell.Alacritty,
      path: alacrittyExecutable,
      bundleID: alacrittyInfo.bundleID,
    })
  }

  if (tabbyInfo) {
    const tabbyExecutable = `${tabbyInfo.path}/Contents/MacOS/Tabby`
    shells.push({
      shell: Shell.Tabby,
      path: tabbyExecutable,
      bundleID: tabbyInfo.bundleID,
    })
  }

  if (wezTermInfo) {
    const wezTermExecutable = `${wezTermInfo.path}/Contents/MacOS/wezterm`
    shells.push({
      shell: Shell.WezTerm,
      path: wezTermExecutable,
      bundleID: wezTermInfo.bundleID,
    })
  }

  if (warpInfo) {
    const warpExecutable = `${warpInfo.path}/Contents/MacOS/stable`
    shells.push({
      shell: Shell.Warp,
      path: warpExecutable,
      bundleID: warpInfo.bundleID,
    })
  }

  return shells
}

export function launch(
  foundShell: FoundShell<Shell>,
  path: string
): ChildProcess {
  if (foundShell.shell === Shell.Kitty) {
    // kitty does not handle arguments as expected when using `open` with
    // an existing session but closed window (it reverts to the previous
    // directory rather than using the new directory directory).
    //
    // This workaround launches the internal `kitty` executable which
    // will open a new window to the desired path.
    return spawn(foundShell.path, ['--single-instance', '--directory', path])
  } else if (foundShell.shell === Shell.Alacritty) {
    // Alacritty cannot open files in the folder format.
    //
    // It uses --working-directory command to start the shell
    // in the specified working directory.
    return spawn(foundShell.path, ['--working-directory', path])
  } else if (foundShell.shell === Shell.Tabby) {
    // Tabby cannot open files in the folder format.
    //
    // It uses open command to start the shell
    // in the specified working directory.
    return spawn(foundShell.path, ['open', path])
  } else if (foundShell.shell === Shell.WezTerm) {
    // WezTerm, like Alacritty, "cannot open files in the 'folder' format."
    //
    // It uses the subcommand `start`, followed by the option `--cwd` to set
    // the working directory, followed by the path.
    return spawn(foundShell.path, ['start', '--cwd', path])
  } else {
    return spawn('open', ['-b', foundShell.bundleID, path])
  }
}

export function launchCustomShell(
  customShell: ICustomIntegration,
  path: string
): ChildProcess {
  const argv = parseCustomIntegrationArguments(customShell.arguments)
  const args = expandTargetPathArgument(argv, path)

  return customShell.bundleID
    ? spawnCustomIntegration('open', ['-b', customShell.bundleID, ...args])
    : spawnCustomIntegration(customShell.path, args)
}
