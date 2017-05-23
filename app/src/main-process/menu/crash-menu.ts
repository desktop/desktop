import { Menu } from 'electron'

/**
 * Update the menu to disable all non-essential menu items.
 *
 * Used when the app has detected a non-recoverable error and
 * the ui process has been terminated. Since most of the app
 * menu items require the ui process to work we'll have to
 * disable them.
 */
export function setCrashMenu() {
  const menu = Menu.getApplicationMenu()

  if (!menu) {
    return
  }

  for (const topLevelItem of menu.items) {
    disable(topLevelItem)
  }
}

function disable(item: Electron.MenuItem) {
  let anyEnabled = false

  if (item.submenu instanceof Menu) {
    for (const submenuItem of item.submenu.items) {
      if (disable(submenuItem)) {
        anyEnabled = true
      }
    }
  }

  if (anyEnabled || item.role) {
    return true
  }

  const id = (item as any).id

  if (id === 'show-devtools' || id === 'reload-window') {
    return true
  }

  item.enabled = false
  return false
}
