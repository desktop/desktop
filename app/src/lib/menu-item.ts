import { invokeContextualMenu } from '../ui/main-process-proxy'

export interface IMenuItem {
  /** The user-facing label. */
  readonly label?: string

  /** The action to invoke when the user selects the item. */
  readonly action?: () => void

  /** The type of item. */
  readonly type?: 'separator'

  /** Is the menu item enabled? Defaults to true. */
  readonly enabled?: boolean

  /**
   * The predefined behavior of the menu item.
   *
   * When specified the click property will be ignored.
   * See https://electronjs.org/docs/api/menu-item#roles
   */
  readonly role?: Electron.MenuItemConstructorOptions['role']

  /**
   * Submenu that will appear when hovering this menu item.
   */
  readonly submenu?: ReadonlyArray<this>
}

/**
 * A menu item data structure that can be serialized and sent via IPC.
 */
export interface ISerializableMenuItem extends IMenuItem {
  readonly action: undefined
}

/**
 * Converts Electron accelerator modifiers to their platform specific
 * name or symbol.
 *
 * Example: CommandOrControl becomes either '⌘' or 'Ctrl' depending on platform.
 *
 * See https://github.com/electron/electron/blob/fb74f55/docs/api/accelerator.md
 */
export function getPlatformSpecificNameOrSymbolForModifier(
  modifier: string
): string {
  switch (modifier.toLowerCase()) {
    case 'cmdorctrl':
    case 'commandorcontrol':
      return __DARWIN__ ? '⌘' : 'Ctrl'

    case 'ctrl':
    case 'control':
      return __DARWIN__ ? '⌃' : 'Ctrl'

    case 'shift':
      return __DARWIN__ ? '⇧' : 'Shift'
    case 'alt':
      return __DARWIN__ ? '⌥' : 'Alt'

    // Mac only
    case 'cmd':
    case 'command':
      return '⌘'
    case 'option':
      return '⌥'

    // Special case space because no one would be able to see it
    case ' ':
      return 'Space'
  }

  // Not a known modifier, likely a normal key
  return modifier
}

/** Show the given menu items in a contextual menu. */
export async function showContextualMenu(
  items: ReadonlyArray<IMenuItem>,
  addSpellCheckMenu = false
) {
  const indices = await invokeContextualMenu(
    serializeMenuItems(items),
    addSpellCheckMenu
  )

  if (indices !== null) {
    const menuItem = findSubmenuItem(items, indices)

    if (menuItem !== undefined && menuItem.action !== undefined) {
      menuItem.action()
    }
  }
}

/**
 * Remove the menu items properties that can't be serializable in
 * order to pass them via IPC.
 */
function serializeMenuItems(
  items: ReadonlyArray<IMenuItem>
): ReadonlyArray<ISerializableMenuItem> {
  return items.map(item => ({
    ...item,
    action: undefined,
    submenu: item.submenu ? serializeMenuItems(item.submenu) : undefined,
  }))
}

/**
 * Traverse the submenus of the context menu until we find the appropriate index.
 */
function findSubmenuItem(
  currentContextualMenuItems: ReadonlyArray<IMenuItem>,
  indices: ReadonlyArray<number>
): IMenuItem | undefined {
  let foundMenuItem: IMenuItem | undefined = {
    submenu: currentContextualMenuItems,
  }

  for (const index of indices) {
    if (foundMenuItem === undefined || foundMenuItem.submenu === undefined) {
      return undefined
    }

    foundMenuItem = foundMenuItem.submenu[index]
  }

  return foundMenuItem
}
