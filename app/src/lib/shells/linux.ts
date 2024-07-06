import { spawn, ChildProcess } from 'child_process'
import { assertNever } from '../fatal-error'
import { parseEnumValue } from '../enum'
import { pathExists } from '../../ui/lib/path-exists'
import { FoundShell } from './shared'

export enum Shell {
  Gnome = 'GNOME Terminal',
  Mate = 'MATE Terminal',
  Tilix = 'Tilix',
  Terminator = 'Terminator',
  Urxvt = 'URxvt',
  Konsole = 'Konsole',
  Xterm = 'XTerm',
  Terminology = 'Terminology',
  Deepin = 'Deepin Terminal',
  Elementary = 'Elementary Terminal',
  XFCE = 'XFCE Terminal',
  Alacritty = 'Alacritty',
  Kitty = 'Kitty',
}

export const Default = Shell.Gnome

export function parse(label: string): Shell {
  return parseEnumValue(Shell, label) ?? Default
}

async function getPathIfAvailable(path: string): Promise<string | null> {
  return (await pathExists(path)) ? path : null
}

function getShellPath(shell: Shell): Promise<string | null> {
  switch (shell) {
    case Shell.Gnome:
      return getPathIfAvailable('/usr/bin/gnome-terminal')
    case Shell.Mate:
      return getPathIfAvailable('/usr/bin/mate-terminal')
    case Shell.Tilix:
      return getPathIfAvailable('/usr/bin/tilix')
    case Shell.Terminator:
      return getPathIfAvailable('/usr/bin/terminator')
    case Shell.Urxvt:
      return getPathIfAvailable('/usr/bin/urxvt')
    case Shell.Konsole:
      return getPathIfAvailable('/usr/bin/konsole')
    case Shell.Xterm:
      return getPathIfAvailable('/usr/bin/xterm')
    case Shell.Terminology:
      return getPathIfAvailable('/usr/bin/terminology')
    case Shell.Deepin:
      return getPathIfAvailable('/usr/bin/deepin-terminal')
    case Shell.Elementary:
      return getPathIfAvailable('/usr/bin/io.elementary.terminal')
    case Shell.XFCE:
      return getPathIfAvailable('/usr/bin/xfce4-terminal')
    case Shell.Alacritty:
      return getPathIfAvailable('/usr/bin/alacritty')
    case Shell.Kitty:
      return getPathIfAvailable('/usr/bin/kitty')
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}

export async function getAvailableShells(): Promise<
  ReadonlyArray<FoundShell<Shell>>
> {
  const [
    gnomeTerminalPath,
    mateTerminalPath,
    tilixPath,
    terminatorPath,
    urxvtPath,
    konsolePath,
    xtermPath,
    terminologyPath,
    deepinPath,
    elementaryPath,
    xfcePath,
    alacrittyPath,
    kittyPath,
  ] = await Promise.all([
    getShellPath(Shell.Gnome),
    getShellPath(Shell.Mate),
    getShellPath(Shell.Tilix),
    getShellPath(Shell.Terminator),
    getShellPath(Shell.Urxvt),
    getShellPath(Shell.Konsole),
    getShellPath(Shell.Xterm),
    getShellPath(Shell.Terminology),
    getShellPath(Shell.Deepin),
    getShellPath(Shell.Elementary),
    getShellPath(Shell.XFCE),
    getShellPath(Shell.Alacritty),
    getShellPath(Shell.Kitty),
  ])

  const shells: Array<FoundShell<Shell>> = []
  if (gnomeTerminalPath) {
    shells.push({ shell: Shell.Gnome, path: gnomeTerminalPath })
  }

  if (mateTerminalPath) {
    shells.push({ shell: Shell.Mate, path: mateTerminalPath })
  }

  if (tilixPath) {
    shells.push({ shell: Shell.Tilix, path: tilixPath })
  }

  if (terminatorPath) {
    shells.push({ shell: Shell.Terminator, path: terminatorPath })
  }

  if (urxvtPath) {
    shells.push({ shell: Shell.Urxvt, path: urxvtPath })
  }

  if (konsolePath) {
    shells.push({ shell: Shell.Konsole, path: konsolePath })
  }

  if (xtermPath) {
    shells.push({ shell: Shell.Xterm, path: xtermPath })
  }

  if (terminologyPath) {
    shells.push({ shell: Shell.Terminology, path: terminologyPath })
  }

  if (deepinPath) {
    shells.push({ shell: Shell.Deepin, path: deepinPath })
  }

  if (elementaryPath) {
    shells.push({ shell: Shell.Elementary, path: elementaryPath })
  }

  if (xfcePath) {
    shells.push({ shell: Shell.XFCE, path: xfcePath })
  }

  if (alacrittyPath) {
    shells.push({ shell: Shell.Alacritty, path: alacrittyPath })
  }

  if (kittyPath) {
    shells.push({ shell: Shell.Kitty, path: kittyPath })
  }

  return shells
}

export function launch(
  foundShell: FoundShell<Shell>,
  path: string
): ChildProcess {
  const shell = foundShell.shell
  switch (shell) {
    case Shell.Gnome:
    case Shell.Mate:
    case Shell.Tilix:
    case Shell.Terminator:
    case Shell.XFCE:
    case Shell.Alacritty:
      return spawn(foundShell.path, ['--working-directory', path])
    case Shell.Urxvt:
      return spawn(foundShell.path, ['-cd', path])
    case Shell.Konsole:
      return spawn(foundShell.path, ['--workdir', path])
    case Shell.Xterm:
      return spawn(foundShell.path, ['-e', '/bin/bash'], { cwd: path })
    case Shell.Terminology:
      return spawn(foundShell.path, ['-d', path])
    case Shell.Deepin:
      return spawn(foundShell.path, ['-w', path])
    case Shell.Elementary:
      return spawn(foundShell.path, ['-w', path])
    case Shell.Kitty:
      return spawn(foundShell.path, ['--single-instance', '--directory', path])
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}
