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
      updateShortcut()
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

function spawnSquirrelUpdate(command: string): Promise<void> {
  const appFolder = Path.resolve(process.execPath, '..')
  const rootAppDir = Path.resolve(appFolder, '..')
  const updateDotExe = Path.resolve(Path.join(rootAppDir, 'Update.exe'))
  const exeName = Path.basename(process.execPath)

  try {
    const p = ChildProcess.spawn(updateDotExe, [ command, exeName ], { detached: true })
    return new Promise<void>((resolve, reject) => {
      p.on('exit', () => {
        resolve()
      })
    })
  } catch (error) {
    return Promise.reject(error)
  }
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
