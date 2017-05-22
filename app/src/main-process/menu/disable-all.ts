import { Menu } from 'electron'

export function disableAll() {
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

  item.enabled = false
  return false
}
