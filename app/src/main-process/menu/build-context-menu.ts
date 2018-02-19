import { IMenuItem } from '../../lib/menu-item'
import { Menu, MenuItem } from 'electron'

/**
 * Gets a value indicating whether or not two roles are considered
 * equal using a case-insensitive comparison.
 */
function roleEquals(x: string | undefined, y: string | undefined) {
  return (x ? x.toLowerCase() : x) === (y ? y.toLowerCase() : y)
}

/**
 * Get platform-specific edit menu items by leveraging Electron's
 * built-in editMenu role.
 */
function getEditMenuItems(): ReadonlyArray<MenuItem> {
  const menu = Menu.buildFromTemplate([{ role: 'editMenu' }]).items[0]

  // Electron is violating its contract if there's no subMenu but
  // we'd rather just ignore it than crash. It's not the end of
  // the world if we don't have edit menu items.
  const items = menu && menu.submenu ? menu.submenu.items : []

  // We don't use styled inputs anywhere at the moment
  // so let's skip this for now and when/if we do we
  // can make it configurable from the callee
  return items.filter(x => !roleEquals(x.role, 'pasteandmatchstyle'))
}

/**
 * Create an Electron menu object for use in a context menu based on
 * a template provided by the renderer.
 *
 * If the template contains a menu item with the role 'editMenu' the
 * platform standard edit menu items will be inserted at the position
 * of the 'editMenu' template.
 *
 * @param template One or more menu item templates as passed from
 *                 the renderer.
 * @param onClick  A callback function for when one of the menu items
 *                 constructed from the template is clicked. Callback
 *                 is passed the index of the menu item in the template
 *                 as the first argument and the template item itself
 *                 as the second argument. Note that the callback will
 *                 not be called when expanded/automatically created
 *                 edit menu items are clicked.
 */
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
    if (roleEquals(item.role, 'editmenu')) {
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
