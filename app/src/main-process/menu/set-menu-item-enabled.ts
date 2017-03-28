import { findMenuItemByID } from './find-menu-item'

/**
 * Set a menu item's enabledness. If the item has a submenu, then each of its
 * submenu items' enabledness is also set.
 *
 * Returns whether any menu item's enabledness was actually changed.
 */
export function setMenuItemEnabled(menu: Electron.Menu, id: string, enabled: boolean): boolean {
  const item = findMenuItemByID(menu, id)
  if (!item) {
    return false
  }

  let changed = false
  if (item.enabled !== enabled) {
    item.enabled = enabled
    changed = true
  }

  // We're assuming we're working with an already created menu.
  const submenu = item.submenu as Electron.Menu
  if (submenu) {
    const items = submenu.items
    for (const item of items) {
      if (item.enabled !== enabled) {
        item.enabled = enabled
        changed = true
      }
    }
  }

  return changed
}
