import { app } from 'electron'
import * as ChildProcess from 'child_process'
import * as Path from 'path'
import * as Fs from 'fs'
import * as Os from 'os'

export function handleSquirrelEvent(eventName: string): boolean {
  switch (eventName) {
    case '--squirrel-install':
      createShortcut()
      return true

    case '--squirrel-updated':
      handleUpdate()
      return true

    case '--squirrel-uninstall':
      removeShortcut()
      setTimeout(app.quit, 1000)
      return true

    case '--squirrel-obsolete':
      app.quit()
      return true
  }

  return false
}

async function handleUpdate(): Promise<void> {
  await updateShortcut()

  const paths = await getPathSegments()

  await writeCLITrampoline()

  const binPath = getBinPath()
  if (paths.indexOf(binPath) > -1) { return }

  return setPathSegments([ ...paths, binPath ])
}

function getBinPath(): string {
  const appFolder = Path.resolve(process.execPath, '..')
  const rootAppDir = Path.resolve(appFolder, '..')
  return Path.join(rootAppDir, 'bin')
}

/**
 * Here's the problem: our path contains our version number. So each time we
 * update, the path to our app changes. So it's Real Hard to add our path
 * directly to `Path` and remove stale entries.
 *
 * So instead, we write a trampoline out to a fixed path, still inside our
 * `AppData` directory but outside the part that includes the version. Then we
 * update the trampoline every time we update to launch the _real_ `github`
 * tool.
 */
async function writeCLITrampoline(): Promise<void> {
  const appFolder = Path.resolve(process.execPath, '..')
  const versionedPath = Path.relative(getBinPath(), Path.join(appFolder, 'resources', 'app', 'static', 'github.bat'))
  const trampline = `@echo off\n"%~dp0\\${versionedPath}" %*`
  const trampolinePath = Path.join(getBinPath(), 'github.bat')
  return new Promise<void>((resolve, reject) => {
    Fs.writeFile(trampolinePath, trampline, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

async function spawnSquirrelUpdate(command: string): Promise<void> {
  const appFolder = Path.resolve(process.execPath, '..')
  const rootAppDir = Path.resolve(appFolder, '..')
  const updateDotExe = Path.resolve(Path.join(rootAppDir, 'Update.exe'))
  const exeName = Path.basename(process.execPath)

  await spawn(updateDotExe, [ command, exeName ])
}

function createShortcut(): Promise<void> {
  return spawnSquirrelUpdate('--createShortcut')
}

function removeShortcut(): Promise<void> {
  return spawnSquirrelUpdate('--removeShortcut')
}

function updateShortcut(): Promise<void> {
  const homeDirectory = Os.homedir()
  if (homeDirectory) {
    const desktopShortcutPath = Path.join(homeDirectory, 'Desktop', 'GitHub Desktop.lnk')
    return new Promise<void>((resolve, reject) => {
      Fs.exists(desktopShortcutPath, async exists => {
        if (exists) {
          await createShortcut()
          resolve()
        } else {
          resolve()
        }
      })
    })
  } else {
    return createShortcut()
  }
}

async function getPathSegments(): Promise<ReadonlyArray<string>> {
  let powershellPath: string
  const systemRoot = process.env['SystemRoot']
  if (systemRoot) {
    const system32Path = Path.join(process.env.SystemRoot, 'System32')
    powershellPath = Path.join(system32Path, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
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
  return pathOutput
    .split(/;+/)
    .filter(segment => segment.length)
}

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
          reject(new Error(`Command failed: ${stdout}`))
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

async function setPathSegments(paths: ReadonlyArray<string>): Promise<void> {
  let setxPath: string
  const systemRoot = process.env['SystemRoot']
  if (systemRoot) {
    const system32Path = Path.join(systemRoot, 'System32')
    setxPath = Path.join(system32Path, 'setx.exe')
  } else {
    setxPath = 'setx.exe'
  }

  await spawn(setxPath, [ 'Path', paths.join(';') ])
}
