import { ISerializableMenuItem } from '../../lib/menu-item'
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
 *                 is passed an array of indices corresponding to the
 *                 positions of each of the parent menus of the clicked
 *                 item (so when clicking a top-level menu item an array
 *                 with a single element will be passed). Note that the
 *                 callback will not be called when expanded/automatically
 *                 created edit menu items are clicked.
 */
export function buildContextMenu(
  template: ReadonlyArray<ISerializableMenuItem>,
  onClick: (indices: ReadonlyArray<number>) => void
): Menu {
  return buildRecursiveContextMenu(template, onClick)
}

function buildRecursiveContextMenu(
  menuItems: ReadonlyArray<ISerializableMenuItem>,
  actionFn: (indices: ReadonlyArray<number>) => void,
  currentIndices: ReadonlyArray<number> = []
): Menu {
  const menu = new Menu()

  for (const [idx, item] of menuItems.entries()) {
    if (roleEquals(item.role, 'editmenu')) {
      for (const editItem of getEditMenuItems()) {
        menu.append(editItem)
      }
    } else {
      const indices = [...currentIndices, idx]

      menu.append(
        new MenuItem({
          label: item.label,
          type: item.type,
          enabled: item.enabled,
          role: item.role,
          click: () => actionFn(indices),
          submenu: item.submenu
            ? buildRecursiveContextMenu(item.submenu, actionFn, indices)
            : undefined,
        })
      )
    }
  }

  return menu
}
