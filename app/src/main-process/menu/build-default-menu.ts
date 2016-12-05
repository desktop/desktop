import { shell, Menu, ipcMain } from 'electron'
import { SharedProcess } from '../../shared-process/shared-process'
import { ensureItemIds } from './ensure-item-ids'
import { MenuEvent } from './menu-event'

export function buildDefaultMenu(sharedProcess: SharedProcess): Electron.Menu {
  const template = new Array<Electron.MenuItemOptions>()

  const updateMenuItems: Electron.MenuItemOptions[] = [
    {
      label: 'Check for Updates…',
      id: 'check-for-updates',
      visible: true,
      click: emit('check-for-updates'),
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
      click: emit('quit-and-install-update'),
    },
  ]

  if (__DARWIN__) {
    template.push({
      label: 'GitHub',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        ...updateMenuItems,
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
  }

  template.push({
    label: 'File',
    submenu: [
      {
        label: 'New Branch…',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: emit('create-branch'),
      },
      { type: 'separator' },
      {
        label: 'Add Repository…',
        click: emit('add-repository'),
      },
      {
        label: 'Add Local Repository…',
        accelerator: 'CmdOrCtrl+O',
        click: emit('add-local-repository'),
      },
    ],
  })

  if (__DARWIN__) {
    template.push({
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
    })
  }

  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Changes',
        accelerator: 'CmdOrCtrl+1',
        click: emit('select-changes'),
      },
      {
        label: 'History',
        accelerator: 'CmdOrCtrl+2',
        click: emit('select-history'),
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
  })

  template.push({
    label: 'Repository',
    submenu: [
      {
        label: 'Show Branches',
        accelerator: 'CmdOrCtrl+B',
        click: emit('show-branches'),
      },
      { type: 'separator' },
      {
        label: 'Push',
        accelerator: 'CmdOrCtrl+P',
        click: emit('push'),
      },
      {
        label: 'Pull',
        accelerator: 'CmdOrCtrl+Shift+P',
        click: emit('pull'),
      },
      {
        label: 'Remove',
        click: emit('remove-repository'),
      },
    ],
  })

  template.push({
    label: 'Branch',
    submenu: [
      {
        label: 'Rename…',
        id: 'rename-branch',
        click: emit('rename-branch'),
      },
      {
        label: 'Delete…',
        id: 'delete-branch',
        click: emit('delete-branch'),
      },
    ],
  })

  if (__DARWIN__) {
    template.push({
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' },
      ],
    })
  }

  template.push({
    role: 'help',
    submenu: [
      ...updateMenuItems,
      {
        label: 'Contact GitHub Support…',
        click () {
          shell.openExternal('https://github.com/support')
        },
      },
    ],
  })

  ensureItemIds(template)

  return Menu.buildFromTemplate(template)
}

/**
 * Utility function returning a Click event handler which, when invoked, emits
 * the provided menu event over IPC.
 */
function emit(name: MenuEvent): () => void {
  return () => ipcMain.emit('menu-event', { name })
}
