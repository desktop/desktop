import { assertNever } from '../lib/fatal-error'

/** A type union of all possible types of menu items */
export type MenuItem =
  | IMenuItem
  | ISubmenuItem
  | ISeparatorMenuItem
  | ICheckboxMenuItem
  | IRadioMenuItem

/** A type union of all types of menu items which can be executed */
export type ExecutableMenuItem = IMenuItem | ICheckboxMenuItem | IRadioMenuItem

/**
 * Common properties for all item types except separator.
 * Only useful for declaring the types, not for consumption
 */
interface IBaseMenuItem {
  readonly id: string
  readonly enabled: boolean
  readonly visible: boolean
  readonly label: string
}

/**
 * An interface describing the properties of a 'normal'
 * menu item, i.e. a clickable item with a label but no
 * other special properties.
 */
export interface IMenuItem extends IBaseMenuItem {
  readonly type: 'menuItem'
  readonly accelerator: string | null
  readonly accessKey: string | null
}

/**
 * An interface describing the properties of a
 * submenu menu item, i.e. an item which has an associated
 * submenu which can be expanded to reveal more menu
 * item. Not in itself executable, only a container.
 */
export interface ISubmenuItem extends IBaseMenuItem {
  readonly type: 'submenuItem'
  readonly menu: IMenu
  readonly accessKey: string | null
}

/**
 * An interface describing the properties of a checkbox
 * menu item, i.e. an item which has an associated checked
 * state that can be toggled by executing it.
 */
export interface ICheckboxMenuItem extends IBaseMenuItem {
  readonly type: 'checkbox'
  readonly accelerator: string | null
  readonly accessKey: string | null
  readonly checked: boolean
}

/**
 * An interface describing the properties of a checkbox
 * menu item, i.e. an item which has an associated checked
 * state that is checked or unchecked based on application logic.
 *
 * The radio menu item is probably going to be used in a collection
 * of more radio menu items where the checked item is assigned
 * based on the last executed item in that group.
 */
export interface IRadioMenuItem extends IBaseMenuItem {
  readonly type: 'radio'
  readonly accelerator: string | null
  readonly accessKey: string | null
  readonly checked: boolean
}

/**
 * An interface describing the properties of a separator menu
 * item, i.e. an item which sole purpose is to create separation
 * between menu items. It has no other semantics and is purely
 * a visual hint.
 */
export interface ISeparatorMenuItem {
  readonly id: string
  readonly type: 'separator'
  readonly visible: boolean
}

/**
 * An interface describing a menu.
 *
 * Holds collection of menu items and an indication of which item (if any)
 * in the menu is selected.
 */
export interface IMenu {
  /**
   * The id of this menu. For the root menu this will be undefined. For all
   * other menus it will be the same as the id of the submenu item which
   * owns this menu.
   *
   * +---------------------------+
   * | Root menu (id: undefined) |
   * +---------------------------+  +--------------------------+
   * |  File (id File)           +--> File menu (id: File)     |
   * +---------------------------+  +--------------------------+
   * |  Edit (id Edit)           |  |  Open (id File.Open)     |
   * +---------------------------+  +--------------------------+
   *                                |  Close (id File.Close)   |
   *                                +--------------------------+
   */
  readonly id?: string

  /** Type identifier, used for type narrowing */
  readonly type: 'menu'

  /** A collection of zero or more menu items */
  readonly items: ReadonlyArray<MenuItem>

  /** The selected item in the menu or undefined if no item is selected */
  readonly selectedItem?: MenuItem
}

/**
 * Gets the accelerator for a given menu item. If the menu item doesn't
 * have an explicitly defined accelerator but does have a defined role
 * the default accelerator (if any) for that particular role will be
 * returned.
 */
function getAccelerator(menuItem: Electron.MenuItem): string | null {
  if (menuItem.accelerator) {
    return menuItem.accelerator as string
  }

  if (menuItem.role) {
    const unsafeItem = menuItem as any
    // https://github.com/electron/electron/blob/d4a8a64ba/lib/browser/api/menu-item.js#L62
    const getDefaultRoleAccelerator = unsafeItem.getDefaultRoleAccelerator

    if (typeof getDefaultRoleAccelerator === 'function') {
      try {
        const defaultRoleAccelerator = getDefaultRoleAccelerator.call(menuItem)
        if (typeof defaultRoleAccelerator === 'string') {
          return defaultRoleAccelerator
        }
      } catch (err) {
        console.error('Could not retrieve default accelerator', err)
      }
    }
  }

  return null
}

/**
 * Return the access key (applicable on Windows) from a menu item label.
 *
 * An access key is a letter or symbol preceded by an ampersand, i.e. in
 * the string "Check for &updates" the access key is 'u'. Access keys are
 * case insensitive and are unique per menu.
 */
function getAccessKey(text: string): string | null {
  const m = text.match(/&([^&])/)
  return m ? m[1] : null
}

/**
 * Creates an instance of one of the types in the MenuItem type union based
 * on an Electron MenuItem instance. Will recurse through all sub menus and
 * convert each item.
 */
function menuItemFromElectronMenuItem(menuItem: Electron.MenuItem): MenuItem {
  // Our menu items always have ids and Electron.MenuItem takes on whatever
  // properties was defined on the MenuItemOptions template used to create it
  // but doesn't surface those in the type declaration.
  const id: string | undefined = (menuItem as any).id
  if (!id) {
    throw new Error(`menuItem must specify id: ${menuItem.label}`)
  }
  const enabled = menuItem.enabled
  const visible = menuItem.visible
  const label = menuItem.label
  const checked = menuItem.checked
  const accelerator = getAccelerator(menuItem)
  const accessKey = getAccessKey(menuItem.label)

  // normal, separator, submenu, checkbox or radio.
  switch (menuItem.type) {
    case 'normal':
      return {
        id,
        type: 'menuItem',
        label,
        enabled,
        visible,
        accelerator,
        accessKey,
      }
    case 'separator':
      return { id, type: 'separator', visible }
    case 'submenu':
      const menu = menuFromElectronMenu(menuItem.submenu as Electron.Menu, id)
      return {
        id,
        type: 'submenuItem',
        label,
        enabled,
        visible,
        menu,
        accessKey,
      }
    case 'checkbox':
      return {
        id,
        type: 'checkbox',
        label,
        enabled,
        visible,
        accelerator,
        checked,
        accessKey,
      }
    case 'radio':
      return {
        id,
        type: 'radio',
        label,
        enabled,
        visible,
        accelerator,
        checked,
        accessKey,
      }
    default:
      return assertNever(
        menuItem.type,
        `Unknown menu item type ${menuItem.type}`
      )
  }
}
/**
 * Creates a IMenu instance based on an Electron Menu instance.
 * Will recurse through all sub menus and convert each item using
 * menuItemFromElectronMenuItem.
 *
 * @param menu - The electron menu instance to convert into an
 *               IMenu instance
 *
 * @param id   - The id of the menu. Menus share their id with
 *               their parent item. The root menu id is undefined.
 */
export function menuFromElectronMenu(menu: Electron.Menu, id?: string): IMenu {
  const items = menu.items.map(menuItemFromElectronMenuItem)

  if (__DEV__) {
    const seenAccessKeys = new Set<string>()

    for (const item of items) {
      if (item.visible) {
        if (itemMayHaveAccessKey(item) && item.accessKey) {
          if (seenAccessKeys.has(item.accessKey.toLowerCase())) {
            throw new Error(
              `Duplicate access key '${item.accessKey}' for item ${item.label}`
            )
          } else {
            seenAccessKeys.add(item.accessKey.toLowerCase())
          }
        }
      }
    }
  }

  return { id, type: 'menu', items }
}

/**
 * Creates a map between MenuItem ids and MenuItems by recursing
 * through all items and all submenus.
 */
function buildIdMap(
  menu: IMenu,
  map = new Map<string, MenuItem>()
): Map<string, MenuItem> {
  for (const item of menu.items) {
    map.set(item.id, item)
    if (item.type === 'submenuItem') {
      buildIdMap(item.menu, map)
    }
  }

  return map
}

/** Type guard which narrows a MenuItem to one which supports access keys */
export function itemMayHaveAccessKey(
  item: MenuItem
): item is IMenuItem | ISubmenuItem | ICheckboxMenuItem | IRadioMenuItem {
  return (
    item.type === 'menuItem' ||
    item.type === 'submenuItem' ||
    item.type === 'checkbox' ||
    item.type === 'radio'
  )
}

/**
 * Returns a value indicating whether or not the given menu item can be
 * selected. Selectable items are non-separator items which are enabled
 * and visible.
 */
export function itemIsSelectable(item: MenuItem) {
  return item.type !== 'separator' && item.enabled && item.visible
}

/**
 * Attempts to locate a menu item matching the provided access key in a
 * given list of items. The access key comparison is case-insensitive.
 *
 * Note that this function does not take into account whether or not the
 * item is selectable, consumers of this function need to perform that
 * check themselves when applicable.
 */
export function findItemByAccessKey(
  accessKey: string,
  items: ReadonlyArray<MenuItem>
): IMenuItem | ISubmenuItem | ICheckboxMenuItem | IRadioMenuItem | null {
  const lowerCaseAccessKey = accessKey.toLowerCase()

  for (const item of items) {
    if (itemMayHaveAccessKey(item)) {
      if (
        item.accessKey &&
        item.accessKey.toLowerCase() === lowerCaseAccessKey
      ) {
        return item
      }
    }
  }

  return null
}

/**
 * An immutable, transformable object which represents an application menu
 * and its current state (which menus are open, which items are selected).
 *
 * The primary use case for this is for rendering a custom application menu
 * on non-macOS systems. As such some interactions are explicitly made to
 * conform to Windows menu interactions. This includes things like selecting
 * the entire path up until the last selected item. This is necessary since,
 * on Windows, the parent menu item of a menu might not be selected even
 * though the submenu is. This is in order to allow for some delay when
 * moving the cursor from one menu pane to another.
 *
 * In general, however, this object is not platform specific and much of
 * the interactions are defined by the component using it.
 */
export class AppMenu {
  /**
   * Static constructor for the initial creation of an AppMenu instance
   * from an IMenu instance.
   */
  public static fromMenu(menu: IMenu): AppMenu {
    const map = buildIdMap(menu)
    const openMenus = [menu]

    return new AppMenu(menu, openMenus, map)
  }

  /**
   * Used by static constructors and transformers.
   *
   * @param menu  The menu that this instance operates on, taken from an
   *              electron Menu instance and converted into an IMenu model
   *              by menuFromElectronMenu.
   * @param openMenus A list of currently open menus with their selected items
   *                  in the application menu.
   *
   *                  The semantics around what constitutes an open menu and how
   *                  selection works is defined within this class class as well as
   *                  in the individual components transforming that state.
   * @param menuItemById A map between menu item ids and their corresponding MenuItem.
   */
  private constructor(
    private readonly menu: IMenu,
    public readonly openMenus: ReadonlyArray<IMenu>,
    private readonly menuItemById: Map<string, MenuItem>
  ) {}

  /**
   * Retrieves a menu item by its id.
   */
  public getItemById(id: string): MenuItem | undefined {
    return this.menuItemById.get(id)
  }

  /**
   * Merges the current AppMenu state with a new menu while
   * attempting to maintain selection state.
   */
  public withMenu(newMenu: IMenu): AppMenu {
    const newMap = buildIdMap(newMenu)
    const newOpenMenus = new Array<IMenu>()

    // Enumerate all currently open menus and attempt to recreate
    // the openMenus array with the new menu instances
    for (const openMenu of this.openMenus) {
      let newOpenMenu: IMenu

      // No id means it's the root menu, simple enough.
      if (!openMenu.id) {
        newOpenMenu = newMenu
      } else {
        // Menus share id with their parent item
        const item = newMap.get(openMenu.id)

        if (item && item.type === 'submenuItem') {
          newOpenMenu = item.menu
        } else {
          // This particular menu can't be found in the new menu
          // structure, we have no choice but to bail here and
          // not open this particular menu.
          break
        }
      }

      let newSelectedItem: MenuItem | undefined = undefined

      if (openMenu.selectedItem) {
        newSelectedItem = newMap.get(openMenu.selectedItem.id)
      }

      newOpenMenus.push({
        id: newOpenMenu.id,
        type: 'menu',
        items: newOpenMenu.items,
        selectedItem: newSelectedItem,
      })
    }

    return new AppMenu(newMenu, newOpenMenus, newMap)
  }

  /**
   * Creates a new copy of this AppMenu instance with the given submenu open.
   *
   * @param submenuItem     - The item which submenu should be appended
   *                          to the list of open menus.
   *
   * @param selectFirstItem - A convenience item for automatically selecting
   *                          the first item in the newly opened menu.
   *
   *                          If false the new menu is opened without a selection.
   *
   *                          Defaults to false.
   */
  public withOpenedMenu(
    submenuItem: ISubmenuItem,
    selectFirstItem = false
  ): AppMenu {
    const ourMenuItem = this.menuItemById.get(submenuItem.id)

    if (!ourMenuItem) {
      return this
    }

    if (ourMenuItem.type !== 'submenuItem') {
      throw new Error(
        `Attempt to open a submenu from an item of wrong type: ${
          ourMenuItem.type
        }`
      )
    }

    const parentMenuIndex = this.openMenus.findIndex(
      m => m.items.indexOf(ourMenuItem) !== -1
    )

    // The parent menu has apparently been closed in between, we could go and
    // recreate it but it's probably not worth it.
    if (parentMenuIndex === -1) {
      return this
    }

    const newOpenMenus = this.openMenus.slice(0, parentMenuIndex + 1)

    if (selectFirstItem) {
      // First selectable item.
      const selectedItem = ourMenuItem.menu.items.find(itemIsSelectable)
      newOpenMenus.push({ ...ourMenuItem.menu, selectedItem })
    } else {
      newOpenMenus.push(ourMenuItem.menu)
    }

    return new AppMenu(this.menu, newOpenMenus, this.menuItemById)
  }

  /**
   * Creates a new copy of this AppMenu instance with the given menu removed from
   * the list of open menus.
   *
   * @param menu - The menu which is to be closed, i.e. removed from the
   *               list of open menus.
   */
  public withClosedMenu(menu: IMenu) {
    // Root menu is always open and can't be closed
    if (!menu.id) {
      return this
    }

    const ourMenuIndex = this.openMenus.findIndex(m => m.id === menu.id)

    if (ourMenuIndex === -1) {
      return this
    }

    const newOpenMenus = this.openMenus.slice(0, ourMenuIndex)

    return new AppMenu(this.menu, newOpenMenus, this.menuItemById)
  }

  /**
   * Creates a new copy of this AppMenu instance with the list of open menus trimmed
   * to not include any menus below the given menu.
   *
   * @param menu - The last menu which is to remain in the list of open
   *               menus, all menus below this level will be pruned from
   *               the list of open menus.
   */
  public withLastMenu(menu: IMenu) {
    const ourMenuIndex = this.openMenus.findIndex(m => m.id === menu.id)

    if (ourMenuIndex === -1) {
      return this
    }

    const newOpenMenus = this.openMenus.slice(0, ourMenuIndex + 1)

    return new AppMenu(this.menu, newOpenMenus, this.menuItemById)
  }

  /**
   * Creates a new copy of this AppMenu instance in which the given menu item
   * is selected.
   *
   * Additional semantics:
   *
   *  All menus leading up to the given menu item will have their
   *  selection reset in such a fashion that the selection path
   *  points to the given menu item.
   *
   *  All menus after the menu in which the given item resides
   *  will have their selections cleared.
   *
   * @param menuItem - The menu item which is to be selected.
   */
  public withSelectedItem(menuItem: MenuItem) {
    const ourMenuItem = this.menuItemById.get(menuItem.id)

    // The item that someone is trying to select no longer
    // exists, not much we can do about that.
    if (!ourMenuItem) {
      return this
    }

    const parentMenuIndex = this.openMenus.findIndex(
      m => m.items.indexOf(ourMenuItem) !== -1
    )

    // The menu which the selected item belongs to is no longer open,
    // not much we can do about that.
    if (parentMenuIndex === -1) {
      return this
    }

    const newOpenMenus = this.openMenus.slice()

    const parentMenu = newOpenMenus[parentMenuIndex]

    newOpenMenus[parentMenuIndex] = { ...parentMenu, selectedItem: ourMenuItem }

    // All submenus below the active menu should have their selection cleared
    for (let i = parentMenuIndex + 1; i < newOpenMenus.length; i++) {
      newOpenMenus[i] = { ...newOpenMenus[i], selectedItem: undefined }
    }

    // Ensure that the path that lead us to the currently selected menu is
    // selected. i.e. all menus above the currently active menu should have
    // their selection reset to point to the currently active menu.
    for (let i = parentMenuIndex - 1; i >= 0; i--) {
      const menu = newOpenMenus[i]
      const childMenu = newOpenMenus[i + 1]

      const selectedItem = menu.items.find(
        item => item.type === 'submenuItem' && item.id === childMenu.id
      )

      newOpenMenus[i] = { ...menu, selectedItem }
    }

    return new AppMenu(this.menu, newOpenMenus, this.menuItemById)
  }

  /**
   * Creates a new copy of this AppMenu instance in which the given menu has had
   * its selection state cleared.
   *
   * Additional semantics:
   *
   *  All menus leading up to the given menu item will have their
   *  selection reset in such a fashion that the selection path
   *  points to the given menu.
   *
   * @param menu - The menu which is to have its selection state
   *               cleared.
   */
  public withDeselectedMenu(menu: IMenu) {
    const ourMenuIndex = this.openMenus.findIndex(m => m.id === menu.id)

    // The menu that someone is trying to deselect is no longer open
    // so no need to worry about selection
    if (ourMenuIndex === -1) {
      return this
    }

    const ourMenu = this.openMenus[ourMenuIndex]
    const newOpenMenus = this.openMenus.slice()

    newOpenMenus[ourMenuIndex] = { ...ourMenu, selectedItem: undefined }

    // Ensure that the path to the menu without an active selection is
    // selected. i.e. all menus above should have their selection reset
    // to point to the menu which no longer has an active selection.
    for (let i = ourMenuIndex - 1; i >= 0; i--) {
      const menu = newOpenMenus[i]
      const childMenu = newOpenMenus[i + 1]

      const selectedItem = menu.items.find(
        item => item.type === 'submenuItem' && item.id === childMenu.id
      )

      newOpenMenus[i] = { ...menu, selectedItem }
    }

    return new AppMenu(this.menu, newOpenMenus, this.menuItemById)
  }

  /**
   * Creates a new copy of this AppMenu instance in which all state
   * is reset. Resetting means that only the root menu is open and
   * all selection state is cleared.
   */
  public withReset() {
    return new AppMenu(this.menu, [this.menu], this.menuItemById)
  }
}
