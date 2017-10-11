/** Find the menu item with the given ID. */
export function findMenuItemByID(
  menu: Electron.Menu,
  id: string
): Electron.MenuItem | null {
  const items = menu.items
  for (const item of items) {
    // The electron type definition doesn't include the `id` field :(
    if ((item as any).id === id) {
      return item
    }

    // We're assuming we're working with an already created menu.
    const submenu = item.submenu as Electron.Menu
    if (submenu) {
      const found = findMenuItemByID(submenu, id)
      if (found) {
        return found
      }
    }
  }

  return null
}
