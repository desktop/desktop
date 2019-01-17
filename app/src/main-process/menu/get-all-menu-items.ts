import { Menu, MenuItem } from 'electron'

/**
 * Returns an iterator that traverses the menu and all
 * submenus and yields each menu item therein.
 */
export function* getAllMenuItems(menu: Menu): IterableIterator<MenuItem> {
  for (const menuItem of menu.items) {
    yield menuItem

    if (menuItem.type === 'submenu' && menuItem.submenu !== undefined) {
      yield* getAllMenuItems(menuItem.submenu)
    }
  }
}
