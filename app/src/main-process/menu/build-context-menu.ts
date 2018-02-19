import { IMenuItem } from '../../lib/menu-item'
import { Menu, MenuItem } from 'electron'

// Cached edit menu items
let editMenuItems: ReadonlyArray<MenuItem> | null = null

function getEditMenuItems(): ReadonlyArray<MenuItem> {
  if (!editMenuItems) {
    const editMenu = Menu.buildFromTemplate([{ role: 'editMenu' }]).items[0]

    // Electron is violating its contract if there's no subMenu but
    // we'd rather just ignore it than crash. It's not the end of
    // the world if we don't have edit menu items.
    editMenuItems = (editMenu && editMenu.submenu ? editMenu.submenu.items : [])
      // We don't use styled inputs anywhere at the moment
      // so let's skip this for now and when/if we do we
      // can make it configurable from the callee
      .filter(x => x.role && x.role.toLowerCase() !== 'pasteandmatchstyle')
  }

  return editMenuItems
}

export function buildContextMenu(
  template: ReadonlyArray<IMenuItem>,
  onClick: (ix: number, item: IMenuItem) => void
): Menu {
  const menuItems = new Array<MenuItem>()

  for (const [ix, item] of template.entries()) {
    // Special case editMenu in context menus. What we
    // mean by this is that we want to insert all edit
    // related menu items into the menu at this spot, we
    // don't want a sub menu
    if (item.role === 'editMenu') {
      menuItems.push(...getEditMenuItems())
    } else {
      // TODO: We're always overriding the click function here.
      // It's possible that we might want to add a role-based
      // menu item without a custom click function at some point
      // in the future.
      menuItems.push(
        new MenuItem({
          label: item.label,
          type: item.type,
          enabled: item.enabled,
          role: item.role,
          click: () => onClick(ix, item),
        })
      )
    }
  }

  const menu = new Menu()
  menuItems.forEach(x => menu.append(x))

  return menu
}
