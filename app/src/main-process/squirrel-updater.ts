import { app } from 'electron'
import * as ChildProcess from 'child_process'
import * as Path from 'path'
import * as Fs from 'fs'

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

