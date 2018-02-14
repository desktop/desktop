import { IMenuItem } from '../../lib/menu-item'
import { Menu, MenuItem } from 'electron'

export function buildContextMenu(
  template: ReadonlyArray<IMenuItem>,
  onClick: (item: IMenuItem) => void
): Menu {
  const menu = new Menu()

  for (const item of template) {
    // Special case editMenu in context menus. What we
    // mean by this is that we want to insert all edit
    // related menu items into the menu at this spot, we
    // don't want a sub menu
    if (item.role === 'editMenu') {
      const editMenu = Menu.buildFromTemplate([item]).items[0]

      if (!editMenu.submenu) {
        continue
      }
      // We don't use styled inputs anywhere at the moment
      // so let's skip this for now and when/if we do we
      // can make it configurable from the callee
      editMenu.submenu.items
        .filter(
          editItem =>
            editItem.role &&
            editItem.role.toLocaleLowerCase() !== 'pasteandmatchstyle'
        )
        .forEach(editItem => menu.append(editItem))
    }

    menu.append(
      new MenuItem({
        label: item.label,
        type: item.type,
        enabled: item.enabled,
        role: item.role,
        click: () => onClick(item),
      })
    )
  }

  return menu
}
