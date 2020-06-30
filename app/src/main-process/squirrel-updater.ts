import * as Path from 'path'
import * as Os from 'os'

import { pathExists, ensureDir, writeFile } from 'fs-extra'
import { spawn, getPathSegments, setPathSegments } from '../lib/process/win32'

const appFolder = Path.resolve(process.execPath, '..')
const rootAppDir = Path.resolve(appFolder, '..')
const updateDotExe = Path.resolve(Path.join(rootAppDir, 'Update.exe'))
const exeName = Path.basename(process.execPath)

// A lot of this code was cargo-culted from our Atom comrades:
// https://github.com/atom/atom/blob/7c9f39e3f1d05ee423e0093e6b83f042ce11c90a/src/main-process/squirrel-update.coffee.

/**
 * Handle Squirrel.Windows app lifecycle events.
 *
 * Returns a promise which will resolve when the work is done.
 */
export function handleSquirrelEvent(eventName: string): Promise<void> | null {
  switch (eventName) {
    case '--squirrel-install':
      return handleInstalled()

    case '--squirrel-updated':
      return handleUpdated()

    case '--squirrel-uninstall':
      return handleUninstall()

    case '--squirrel-obsolete':
      return Promise.resolve()
  }

  return null
}

async function handleInstalled(): Promise<void> {
  await createShortcut(['StartMenu', 'Desktop'])
  await installCLI()
}

async function handleUpdated(): Promise<void> {
  await updateShortcut()
  await installCLI()
}

async function installCLI(): Promise<void> {
  const binPath = getBinPath()
  await ensureDir(binPath)
  await writeBatchScriptCLITrampoline(binPath)
  await writeShellScriptCLITrampoline(binPath)
  try {
    const paths = getPathSegments()
    if (paths.indexOf(binPath) < 0) {
      await setPathSegments([...paths, binPath])
    }
  } catch (e) {
    log.error('Failed inserting bin path into PATH environment variable', e)
  }
}

/**
 * Get the path for the `bin` directory which exists in our `AppData` but
 * outside path which includes the installed app version.
 */
function getBinPath(): string {
  return Path.resolve(process.execPath, '../../bin')
}

function resolveVersionedPath(binPath: string, relativePath: string): string {
  const appFolder = Path.resolve(process.execPath, '..')
  return Path.relative(binPath, Path.join(appFolder, relativePath))
}

/**
 * Here's the problem: our app's path contains its version number. So each time
 * we update, the path to our app changes. So it's Real Hard to add our path
 * directly to `Path`. We'd have to detect and remove stale entries, etc.
 *
 * So instead, we write a trampoline out to a fixed path, still inside our
 * `AppData` directory but outside the version-specific path. That trampoline
 * just launches the current version's CLI tool. Then, whenever we update, we
 * rewrite the trampoline to point to the new, version-specific path. Bingo
 * bango Bob's your uncle.
 */
function writeBatchScriptCLITrampoline(binPath: string): Promise<void> {
  const versionedPath = resolveVersionedPath(
    binPath,
    'resources/app/static/github.bat'
  )

  const trampoline = `@echo off\n"%~dp0\\${versionedPath}" %*`
  const trampolinePath = Path.join(binPath, 'github.bat')

  return writeFile(trampolinePath, trampoline)
}

function writeShellScriptCLITrampoline(binPath: string): Promise<void> {
  // The path we get from `resolveVersionedPath` is a Win32 relative
  // path (something like `..\app-2.5.0\resources\app\static\github.sh`).
  // We need to make sure it's a POSIX path in order for WSL to be able
  // to resolve it. See https://github.com/desktop/desktop/issues/4998
  const versionedPath = resolveVersionedPath(
    binPath,
    'resources/app/static/github.sh'
  ).replace(/\\/g, '/')

  const trampoline = `#!/usr/bin/env bash
  DIR="$( cd "$( dirname "\$\{BASH_SOURCE[0]\}" )" && pwd )"
  sh "$DIR/${versionedPath}" "$@"`
  const trampolinePath = Path.join(binPath, 'github')

  return writeFile(trampolinePath, trampoline, { encoding: 'utf8', mode: 755 })
}

/** Spawn the Squirrel.Windows `Update.exe` with a command. */
async function spawnSquirrelUpdate(
  commands: ReadonlyArray<string>
): Promise<void> {
  await spawn(updateDotExe, commands)
}

type ShortcutLocations = ReadonlyArray<'StartMenu' | 'Desktop'>

function createShortcut(locations: ShortcutLocations): Promise<void> {
  return spawnSquirrelUpdate([
    '--createShortcut',
    exeName,
    '-l',
    locations.join(','),
  ])
}

async function handleUninstall(): Promise<void> {
  await removeShortcut()

  try {
    const paths = getPathSegments()
    const binPath = getBinPath()
    const pathsWithoutBinPath = paths.filter(p => p !== binPath)
    return setPathSegments(pathsWithoutBinPath)
  } catch (e) {
    log.error('Failed removing bin path from PATH environment variable', e)
  }
}

function removeShortcut(): Promise<void> {
  return spawnSquirrelUpdate(['--removeShortcut', exeName])
}

async function updateShortcut(): Promise<void> {
  const homeDirectory = Os.homedir()
  if (homeDirectory) {
    const desktopShortcutPath = Path.join(
      homeDirectory,
      'Desktop',
      'GitHub Desktop.lnk'
    )
    const exists = await pathExists(desktopShortcutPath)
    const locations: ShortcutLocations = exists
      ? ['StartMenu', 'Desktop']
      : ['StartMenu']
    return createShortcut(locations)
  } else {
    return createShortcut(['StartMenu', 'Desktop'])
  }
}
