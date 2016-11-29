export type MenuItem = IMenuItem | ISubmenuItem | ISeparatorMenuItem | ICheckboxMenuItem | IRadioMenuItem

export interface IBaseMenuItem {
  readonly id: string
  readonly enabled: boolean
  readonly visible: boolean
  readonly label: string
}

export interface IMenuItem extends IBaseMenuItem {
  readonly type: 'menuItem'
  readonly accelerator: string
}

export interface ISubmenuItem extends IBaseMenuItem {
  readonly type: 'submenuItem'
  readonly menu: IMenu
}

export interface ICheckboxMenuItem extends IBaseMenuItem {
  readonly type: 'checkbox'
  readonly accelerator: string
  readonly checked: boolean
}

export interface IRadioMenuItem extends IBaseMenuItem {
  readonly type: 'radio'
  readonly accelerator: string
  readonly checked: boolean
}

export interface ISeparatorMenuItem {
  readonly id: string
  readonly type: 'separator'
  readonly visible: boolean
}

export interface IMenu {
  // shared with parent submenu item
  readonly id?: string
  readonly type: 'menu'
  readonly items: ReadonlyArray<MenuItem>
  readonly selectedItem?: MenuItem
}

export function menuItemFromElectronMenuItem(menuItem: Electron.MenuItem): MenuItem {
  const id = (menuItem as any).id
  if (!id) {
    throw new Error('menuItem must specify id')
  }
  const enabled = menuItem.enabled
  const visible = menuItem.visible
  const label = menuItem.label
  const checked = menuItem.checked
  const accelerator = menuItem.accelerator

  // normal, separator, submenu, checkbox or radio.
  switch (menuItem.type) {
    case 'normal':
      return { id, type: 'menuItem', label, enabled, visible, accelerator }
    case 'separator':
      return { id, type: 'separator', visible }
    case 'submenu':
      const menu = menuFromElectronMenu(id, menuItem.submenu as Electron.Menu)
      return { id, type: 'submenuItem', label, enabled, visible, menu }
    case 'checkbox':
      return { id, type: 'checkbox', label, enabled, visible, accelerator, checked }
    case 'radio':
      return { id, type: 'radio', label, enabled, visible, accelerator, checked }
    default:
      throw new Error(`Unknown menu item type ${menuItem.type}`)
  }
}

export function menuFromElectronMenu(id: string | undefined, menu: Electron.Menu, selectedItem?: MenuItem): IMenu {
  const items = menu.items.map(menuItemFromElectronMenuItem)
  return { id, type: 'menu', items, selectedItem }
}

function buildIdMap(menu: IMenu, map = new Map<string, MenuItem>()): Map<string, MenuItem> {
  for (const item of menu.items) {
    map.set(item.id, item)
    if (item.type === 'submenuItem') {
      buildIdMap(item.menu, map)
    }
  }

  return map
}

export class AppMenu {
  public readonly openMenus: ReadonlyArray<IMenu>
  private readonly menu: IMenu

  private readonly menuItemById: Map<string, MenuItem>

  public static fromElectronMenu(electronMenu: Electron.Menu): AppMenu {
    const menu = menuFromElectronMenu(undefined, electronMenu)
    const map = buildIdMap(menu)
    const openMenus = [ menu ]

    return new AppMenu(menu, openMenus, map)
  }

  private constructor(menu: IMenu, openMenus: ReadonlyArray<IMenu>, menuItemById: Map<string, MenuItem>) {
    this.menu = menu
    this.openMenus = openMenus
    this.menuItemById = menuItemById
  }

  public withOpenMenu(submenuItem: ISubmenuItem, selectFirstItem = false): AppMenu {
    const ourMenuItem = this.menuItemById.get(submenuItem.id)

    if (!ourMenuItem) {
      return this
    }

    if (ourMenuItem.type !== 'submenuItem') {
      throw new Error(`Attempt to open a submenu from an item of wrong type: ${ourMenuItem.type}`)
    }

    const parentMenuIndex = this.openMenus.findIndex(m => m.items.indexOf(ourMenuItem) !== -1)

    // The parent menu has apparently been closed in between, we could go and
    // recreate it but it's probably not worth it.
    if (parentMenuIndex === -1) {
      return this
    }

    const newOpenMenus = this.openMenus.slice(0, parentMenuIndex + 1)

    if (selectFirstItem) {
      newOpenMenus.push(Object.assign({}, ourMenuItem.menu, { selectedItem: ourMenuItem.menu.items[0] }))
    } else {
      newOpenMenus.push(ourMenuItem.menu)
    }

    return new AppMenu(this.menu, newOpenMenus, this.menuItemById)
  }

  public withCloseMenu(menu: IMenu) {
    // Root menu is always open and can't be closed
    if (!menu.id) {
      return this
    }

    const ourMenuIndex = this.openMenus.findIndex(m => m.id === menu.id)


    if (ourMenuIndex === -1) { return this }

    const newOpenMenus = this.openMenus.slice(0, ourMenuIndex)

    return new AppMenu(this.menu, newOpenMenus, this.menuItemById)
  }

  public withLastMenu(menu: IMenu) {
    const ourMenuIndex = this.openMenus.findIndex(m => m.id === menu.id)

    if (ourMenuIndex === -1) { return this }

    const newOpenMenus = this.openMenus.slice(0, ourMenuIndex + 1)

    return new AppMenu(this.menu, newOpenMenus, this.menuItemById)
  }

  public withSelectedItem(menuItem: MenuItem) {
    const ourMenuItem = this.menuItemById.get(menuItem.id)

    // The item that someone is trying to select no longer
    // exists, not much we can do about that.
    if (!ourMenuItem) {
      return this
    }

    const parentMenuIndex = this.openMenus.findIndex(m => m.items.indexOf(ourMenuItem) !== -1)

    // The menu which the selected item belongs to is no longer open,
    // not much we can do about that.
    if (parentMenuIndex === -1) { return this }

    const newOpenMenus = this.openMenus.slice()

    const parentMenu = newOpenMenus[parentMenuIndex]

    newOpenMenus[parentMenuIndex] = Object.assign({}, parentMenu, { selectedItem: ourMenuItem })

    return new AppMenu(this.menu, newOpenMenus, this.menuItemById)
  }

  public withDeselectedMenu(menu: IMenu) {
    const ourMenuIndex = this.openMenus.findIndex(m => m.id === menu.id)

    // The menu that someone is trying to deselect is no longer open
    // so no need to worry about selection
    if (ourMenuIndex === -1) {
      return this
    }

    const ourMenu = this.openMenus[ourMenuIndex]
    const newOpenMenus = this.openMenus.slice()

    newOpenMenus[ourMenuIndex] = Object.assign({}, ourMenu, { selectedItem: undefined })

    return new AppMenu(this.menu, newOpenMenus, this.menuItemById)
  }

  public withReset() {
    return new AppMenu(this.menu, [ this.menu ], this.menuItemById)
  }
}
