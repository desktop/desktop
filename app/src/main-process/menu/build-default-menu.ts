import { shell, Menu, ipcMain } from 'electron'
import { SharedProcess } from '../../shared-process/shared-process'
import { ensureItemIds } from './ensure-item-ids'
import { MenuEvent } from './menu-event'

export function buildDefaultMenu(sharedProcess: SharedProcess): Electron.Menu {
  const template = new Array<Electron.MenuItemOptions>()

  const updateMenuItems: Electron.MenuItemOptions[] = [
    {
      label: __DARWIN__ ? 'Check for Updates…' : '&Check for Updates…',
      id: 'check-for-updates',
      visible: true,
      click: emit('check-for-updates'),
    },
    {
      label: __DARWIN__ ? 'Checking for Updates…' : 'Checking for updates…',
      id: 'checking-for-updates',
      visible: false,
      enabled: false,
    },
    {
      label: __DARWIN__ ? 'Downloading Update…' : 'Downloading update…',
      id: 'downloading-update',
      visible: false,
      enabled: false,
    },
    {
      label: __DARWIN__ ? 'Quit and Install Update' : '&Quit and install update',
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
    label: __DARWIN__ ? 'File' : '&File',
    submenu: [
      {
        label: __DARWIN__ ? 'New Branch…' : 'New &branch…',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: emit('create-branch'),
      },
      { type: 'separator' },
      {
        label: __DARWIN__ ? 'Add Repository…' : 'Add &repository…',
        click: emit('add-repository'),
      },
      {
        label: __DARWIN__ ? 'Add Local Repository…' : 'Add &local repository…',
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
    label: __DARWIN__ ? 'View' : '&View',
    submenu: [
      {
        label: '&Changes',
        accelerator: 'CmdOrCtrl+1',
        click: emit('select-changes'),
      },
      {
        label: '&History',
        accelerator: 'CmdOrCtrl+2',
        click: emit('select-history'),
      },
      { type: 'separator' },
      {
        label: '&Reload',
        accelerator: 'CmdOrCtrl+R',
        click (item: any, focusedWindow: Electron.BrowserWindow) {
          if (focusedWindow) {
            focusedWindow.reload()
          }
        },
      },
      {
        label: __DARWIN__ ? 'Toggle Full Screen' : 'Toggle &full screen',
        role: 'togglefullscreen',
      },
      {
        label: __DARWIN__ ? 'Toggle Developer Tools' : '&Toggle developer tools',
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
        label: __DARWIN__ ? 'Debug Shared Process' : '&Debug shared process',
        click (item: any, focusedWindow: Electron.BrowserWindow) {
          sharedProcess.show()
        },
      },
    ],
  })

  template.push({
    label: __DARWIN__ ? 'Repository' : '&Repository',
    submenu: [
      {
        label: __DARWIN__ ? 'Show Branches' : 'Show &branches',
        accelerator: 'CmdOrCtrl+B',
        click: emit('show-branches'),
      },
      { type: 'separator' },
      {
        label: __DARWIN__ ? 'Push' : 'Pu&sh',
        accelerator: 'CmdOrCtrl+P',
        click: emit('push'),
      },
      {
        label: __DARWIN__ ? 'Pull' : 'Pu&ll',
        accelerator: 'CmdOrCtrl+Shift+P',
        click: emit('pull'),
      },
      {
        label: __DARWIN__ ? 'Remove' : '&Remove',
        click: emit('remove-repository'),
      },
    ],
  })

  template.push({
    label: __DARWIN__ ? 'Branch' : '&Branch',
    submenu: [
      {
        label: __DARWIN__ ? 'Rename…' : '&Rename…',
        id: 'rename-branch',
        click: emit('rename-branch'),
      },
      {
        label: __DARWIN__ ? 'Delete…' : '&Delete…',
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

  const contactSupportItem: Electron.MenuItemOptions = {
    label: __DARWIN__ ? 'Contact GitHub Support…' : 'Contact GitHub &support…',
    click () {
      shell.openExternal('https://github.com/support')
    },
  }

  if (__DARWIN__) {
    template.push({
      role: 'help',
      submenu: [ contactSupportItem ],
    })
  } else {
    // TODO: This needs a Window about item
    template.push({
      label: '&Help',
      submenu: [
        ...updateMenuItems,
        { type: 'separator' },
        contactSupportItem,
      ],
    })
  }

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
