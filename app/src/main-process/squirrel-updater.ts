import * as ChildProcess from 'child_process'
import * as Path from 'path'
import * as Os from 'os'
import { pathExists, mkdirIfNeeded, writeFile } from '../lib/file-system'

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
  await mkdirIfNeeded(binPath)
  await writeBatchScriptCLITrampoline(binPath)
  await writeShellScriptCLITrampoline(binPath)
  const paths = await getPathSegments()
  if (paths.indexOf(binPath) < 0) {
    await setPathSegments([...paths, binPath])
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
async function writeBatchScriptCLITrampoline(binPath: string): Promise<void> {
  const versionedPath = resolveVersionedPath(
    binPath,
    'resources/app/static/github.bat'
  )

  const trampoline = `@echo off\n"%~dp0\\${versionedPath}" %*`
  const trampolinePath = Path.join(binPath, 'github.bat')

  return writeFile(trampolinePath, trampoline)
}

async function writeShellScriptCLITrampoline(binPath: string): Promise<void> {
  const versionedPath = resolveVersionedPath(
    binPath,
    'resources/app/static/github.sh'
  )

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

  const paths = await getPathSegments()
  const binPath = getBinPath()
  const pathsWithoutBinPath = paths.filter(p => p !== binPath)
  return setPathSegments(pathsWithoutBinPath)
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

/** Get the path segments in the user's `Path`. */
async function getPathSegments(): Promise<ReadonlyArray<string>> {
  let powershellPath: string
  const systemRoot = process.env.SystemRoot
  if (systemRoot != null) {
    const system32Path = Path.join(systemRoot, 'System32')
    powershellPath = Path.join(
      system32Path,
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
  } else {
    powershellPath = 'powershell.exe'
  }

  const args = [
    '-noprofile',
    '-ExecutionPolicy',
    'RemoteSigned',
    '-command',
    // Set encoding and execute the command, capture the output, and return it
    // via .NET's console in order to have consistent UTF-8 encoding.
    // See http://stackoverflow.com/questions/22349139/utf-8-output-from-powershell
    // to address https://github.com/atom/atom/issues/5063
    `
      [Console]::OutputEncoding=[System.Text.Encoding]::UTF8
      $output=[environment]::GetEnvironmentVariable('Path', 'User')
      [Console]::WriteLine($output)
    `,
  ]

  const stdout = await spawn(powershellPath, args)
  const pathOutput = stdout.replace(/^\s+|\s+$/g, '')
  return pathOutput.split(/;+/).filter(segment => segment.length)
}

/** Set the user's `Path`. */
async function setPathSegments(paths: ReadonlyArray<string>): Promise<void> {
  let setxPath: string
  const systemRoot = process.env['SystemRoot']
  if (systemRoot) {
    const system32Path = Path.join(systemRoot, 'System32')
    setxPath = Path.join(system32Path, 'setx.exe')
  } else {
    setxPath = 'setx.exe'
  }

  await spawn(setxPath, ['Path', paths.join(';')])
}

/** Spawn a command with arguments and capture its output. */
function spawn(command: string, args: ReadonlyArray<string>): Promise<string> {
  try {
    const child = ChildProcess.spawn(command, args as string[])
    return new Promise<string>((resolve, reject) => {
      let stdout = ''
      child.stdout.on('data', data => {
        stdout += data
      })

      child.on('close', code => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`Command "${command} ${args}" failed: "${stdout}"`))
        }
      })

      child.on('error', (err: Error) => {
        reject(err)
      })

      // This is necessary if using Powershell 2 on Windows 7 to get the events
      // to raise.
      // See http://stackoverflow.com/questions/9155289/calling-powershell-from-nodejs
      child.stdin.end()
    })
  } catch (error) {
    return Promise.reject(error)
  }
}
