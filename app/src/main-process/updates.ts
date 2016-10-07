import { app } from 'electron'
import * as ChildProcess from 'child_process'
import * as Path from 'path'

export function getFeedURL(username: string): string {
  return `https://central.github.com/api/deployments/desktop/desktop/latest?version=${app.getVersion()}&username=${username}`
}

export function handleSquirrelEvent(eventName: string): boolean {
  const appFolder = Path.resolve(process.execPath, '..')
  const rootAtomFolder = Path.resolve(appFolder, '..')
  const updateDotExe = Path.resolve(Path.join(rootAtomFolder, 'Update.exe'))
  const exeName = Path.basename(process.execPath)

  const spawnUpdate = function(args: string[]) {
    try {
      ChildProcess.spawn(updateDotExe, args, { detached: true })
    } catch (error) {}
  }

  switch (eventName) {
    case '--squirrel-install':
    case '--squirrel-updated':
      spawnUpdate([ '--createShortcut', exeName ])
      return true

    case '--squirrel-uninstall':
      spawnUpdate([ '--removeShortcut', exeName ])
      setTimeout(app.quit, 1000)
      return true

    case '--squirrel-obsolete':
      app.quit()
      return true
  }

  return false
}
