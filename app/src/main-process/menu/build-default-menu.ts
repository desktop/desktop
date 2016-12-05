import { shell, Menu, ipcMain } from 'electron'
import { SharedProcess } from '../../shared-process/shared-process'
import { ensureItemIds } from './ensure-item-ids'
import { MenuEvent } from './menu-event'

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
      label: 'GitHub',
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

function emitMenuEvent(name: MenuEvent) {
  ipcMain.emit('menu-event', { name })
}
