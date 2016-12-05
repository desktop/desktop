import { shell, Menu, ipcMain } from 'electron'
import { SharedProcess } from '../shared-process/shared-process'

export type MenuEvent = 'push' | 'pull' | 'select-changes' | 'select-history' |
                        'add-local-repository' | 'create-branch' |
                        'show-branches' | 'remove-repository' | 'add-repository' |
                        'rename-branch' | 'delete-branch' | 'check-for-updates' |
                        'quit-and-install-update' | 'show-preferences'

export type MenuIDs = 'rename-branch' | 'delete-branch' | 'check-for-updates' |
                      'checking-for-updates' | 'downloading-update' | 'quit-and-install-update' |
                      'preferences'

export function buildDefaultMenu(sharedProcess: SharedProcess): Electron.Menu {
  const template: Electron.MenuItemOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Branch…',
          accelerator: 'CmdOrCtrl+Shift+N',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('create-branch')
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Add Repository…',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('add-repository')
          },
        },
        {
          label: 'Add Local Repository…',
          accelerator: 'CmdOrCtrl+O',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('add-local-repository')
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Changes',
          accelerator: 'CmdOrCtrl+1',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('select-changes')
          },
        },
        {
          label: 'History',
          accelerator: 'CmdOrCtrl+2',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('select-history')
          },
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            if (focusedWindow) {
              focusedWindow.reload()
            }
          },
        },
        { role: 'togglefullscreen' },
        {
          label: 'Toggle Developer Tools',
          accelerator: (() => {
            return __DARWIN__ ? 'Alt+Command+I' : 'Ctrl+Shift+I'
          })(),
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            if (focusedWindow) {
              focusedWindow.webContents.toggleDevTools()
            }
          },
        },
        {
          label: 'Debug shared process',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            sharedProcess.show()
          },
        },
      ],
    },
    {
      label: 'Repository',
      submenu: [
        {
          label: 'Show Branches',
          accelerator: 'CmdOrCtrl+B',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('show-branches')
          },
        },
        { type: 'separator' },
        {
          label: 'Push',
          accelerator: 'CmdOrCtrl+P',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('push')
          },
        },
        {
          label: 'Pull',
          accelerator: 'CmdOrCtrl+Shift+P',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('pull')
          },
        },
        {
          label: 'Remove',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('remove-repository')
          },
        },
      ],
    },
    {
      label: 'Branch',
      submenu: [
        {
          label: 'Rename…',
          id: 'rename-branch',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('rename-branch')
          },
        },
        {
          label: 'Delete…',
          id: 'delete-branch',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('delete-branch')
          },
        },
      ],
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Contact GitHub Support…',
          click () {
            shell.openExternal('https://github.com/support')
          },
        },
      ],
    },
  ]

  if (__DARWIN__) {
    template.unshift({
      label: 'GitHub Desktop',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          id: 'check-for-updates',
          visible: true,
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('check-for-updates')
          },
        },
        {
          label: 'Checking for updates…',
          id: 'checking-for-updates',
          visible: false,
          enabled: false,
        },
        {
          label: 'Downloading update…',
          id: 'downloading-update',
          visible: false,
          enabled: false,
        },
        {
          label: 'Quit and Install Update',
          id: 'quit-and-install-update',
          visible: false,
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('quit-and-install-update')
          },
        },
        { type: 'separator' },
        {
          label: 'Preferences…',
          id: 'preferences',
          accelerator: 'CommandOrCtrl+,',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('show-preferences')
          },
        },
        { type: 'separator' },
        {
          role: 'services',
          submenu: [],
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })

    const windowMenu = template[3] as {submenu: Object[]}
    const windowSubmenu = windowMenu.submenu
    windowSubmenu.push(
      { type: 'separator' },
      { role: 'front' }
    )
  }

  ensureItemIds(template)

  return Menu.buildFromTemplate(template)
}

function getItemId(template: Electron.MenuItemOptions) {
  return template.id || template.label || template.role || 'unknown'
}

/**
 * Ensures that all menu items in the given template are assigned an id
 * by recursively traversing the template and mutating items in place.
 *
 * Items which already have an id are left alone, the other get a unique,
 * but consistent id based on their label or role and their position in
 * the menu hierarchy.
 *
 * Note that this does not do anything to prevent the case where items have
 * explicitly been given duplicate ids.
 */
export function ensureItemIds(template: ReadonlyArray<Electron.MenuItemOptions>, prefix = '@', seenIds = new Set<string>()) {
  for (const item of template) {
    let counter = 0
    let id = item.id

    // Automatically generate an id if one hasn't been explicitly provided
    if (!id) {
      // Ensure that multiple items with the same key gets suffixed with a number
      // i.e. @.separator, @.separator1 @.separator2 etc
      do {
        id = `${prefix}.${getItemId(item)}${counter++ || ''}`
      } while (seenIds.has(id))
    }

    item.id = id
    seenIds.add(id)

    if (item.submenu) {
      const subMenuTemplate = item.submenu as ReadonlyArray<Electron.MenuItemOptions>
      ensureItemIds(subMenuTemplate, item.id, seenIds)
    }
  }
}

function emitMenuEvent(name: MenuEvent) {
  ipcMain.emit('menu-event', { name })
}

/** Find the menu item with the given ID. */
export function findMenuItemByID(menu: Electron.Menu, id: string): Electron.MenuItem | null {
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
      if (found) { return found }
    }
  }

  return null
}
