import { shell, Menu, ipcMain } from 'electron'
import { SharedProcess } from '../shared-process/shared-process'

export type MenuEvent = 'push' | 'pull' | 'select-changes' | 'select-history' |
                        'add-local-repository' | 'create-branch' |
                        'show-branches' | 'remove-repository' | 'add-repository' |
                        'rename-branch' | 'delete-branch'

export type MenuIDs = 'rename-branch' | 'delete-branch'

export function buildDefaultMenu(sharedProcess: SharedProcess): Electron.Menu {
  const template: Object[] = [
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
      label: 'GitHub',
      submenu: [
        { role: 'about' },
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

  return Menu.buildFromTemplate(template)
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
