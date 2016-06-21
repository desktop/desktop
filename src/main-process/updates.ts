import {app} from 'electron'

export function getFeedURL(): string {
  return `https://central.github.com/api/deployments/desktop/desktop/latest?version=${app.getVersion()}`
}

export function handleSquirrelEvent(eventName: string): boolean {
  switch (eventName) {
    case '--squirrel-install':
    case '--squirrel-updated':
      // Optionally do things such as:
      // - Add your .exe to the PATH
      // - Write to the registry for things like file associations and
      //   explorer context menus

      // Install desktop and start menu shortcuts
      return true

    case '--squirrel-uninstall':
      // Undo anything you did in the --squirrel-install and
      // --squirrel-updated handlers

      // Remove desktop and start menu shortcuts
      return true

    case '--squirrel-obsolete':
      // This is called on the outgoing version of your app before
      // we update to the new version - it's the opposite of
      // --squirrel-updated
      return true
  }

  return false
}
