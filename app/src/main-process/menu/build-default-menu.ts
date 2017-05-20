import * as Path from 'path'
import { shell, Menu, ipcMain, app } from 'electron'
import { SharedProcess } from '../../shared-process/shared-process'
import { ensureItemIds } from './ensure-item-ids'
import { MenuEvent } from './menu-event'
import { LogFolder } from '../../lib/logging/logger'

export function buildDefaultMenu(sharedProcess: SharedProcess): Electron.Menu {
  const template = new Array<Electron.MenuItemOptions>()
  const separator: Electron.MenuItemOptions = { type: 'separator' }

  if (__DARWIN__) {
    template.push({
      label: 'GitHub Desktop',
      submenu: [
        { label: 'About GitHub Desktop', click: emit('show-about') },
        separator,
        {
          label: 'Preferences…',
          id: 'preferences',
          accelerator: 'CmdOrCtrl+,',
          click: emit('show-preferences'),
        },
        separator,
        {
          role: 'services',
          submenu: [],
        },
        separator,
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        separator,
        { role: 'quit' },
      ],
    })
  }

  const fileMenu: Electron.MenuItemOptions = {
    label: __DARWIN__ ? 'File' : '&File',
    submenu: [
      {
        label: __DARWIN__ ? 'New Repository…' : 'New &repository…',
        click: emit('create-repository'),
        accelerator: 'CmdOrCtrl+N',
      },
      {
        label: __DARWIN__ ? 'New Branch…' : 'New &branch…',
        id: 'create-branch',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: emit('create-branch'),
      },
      separator,
      {
        label: __DARWIN__ ? 'Add Local Repository…' : 'Add &local repository…',
        accelerator: 'CmdOrCtrl+O',
        click: emit('add-local-repository'),
      },
      {
        label: __DARWIN__ ? 'Clone Repository…' : 'Clo&ne repository…',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: emit('clone-repository'),
      },
    ],
  }

  if (!__DARWIN__) {
    const fileItems = fileMenu.submenu as Electron.MenuItemOptions[]

    fileItems.push(
      separator,
      {
        label: '&Options…',
        id: 'preferences',
        accelerator: 'CmdOrCtrl+,',
        click: emit('show-preferences'),
      },
      separator,
      { role: 'quit' },
    )
  }

  template.push(fileMenu)

  template.push({
    label: __DARWIN__ ? 'Edit' : '&Edit',
    submenu: [
      { role: 'undo', label: __DARWIN__ ? 'Undo' : '&Undo' },
      { role: 'redo', label: __DARWIN__ ? 'Redo' : '&Redo' },
      separator,
      { role: 'cut', label: __DARWIN__ ? 'Cut' : 'Cu&t' },
      { role: 'copy', label: __DARWIN__ ? 'Copy' : '&Copy' },
      { role: 'paste', label: __DARWIN__ ? 'Paste' : '&Paste' },
      { role: 'selectall', label: __DARWIN__ ? 'Select All' : 'Select &all' },
    ],
  })

  template.push({
    label: __DARWIN__ ? 'View' : '&View',
    submenu: [
      {
        label: __DARWIN__ ? 'Show Changes' : '&Changes',
        id: 'show-changes',
        accelerator: 'CmdOrCtrl+1',
        click: emit('select-changes'),
      },
      {
        label: __DARWIN__ ? 'Show History' : '&History',
        id: 'show-history',
        accelerator: 'CmdOrCtrl+2',
        click: emit('select-history'),
      },
      {
        label: __DARWIN__ ? 'Show Repository List' : 'Repository &list',
        id: 'show-repository-list',
        accelerator: 'CmdOrCtrl+T',
        click: emit('choose-repository'),
      },
      {
        label: __DARWIN__ ? 'Show Branches List' : '&Branches list',
        id: 'show-branches-list',
        accelerator: 'CmdOrCtrl+B',
        click: emit('show-branches'),
      },
      separator,
      {
        label: __DARWIN__ ? 'Toggle Full Screen' : 'Toggle &full screen',
        role: 'togglefullscreen',
      },
      separator,
      {
        label: '&Reload',
        accelerator: 'CmdOrCtrl+R',
        click (item: any, focusedWindow: Electron.BrowserWindow) {
          if (focusedWindow) {
            focusedWindow.reload()
          }
        },
        visible: __RELEASE_ENV__ !== 'production',
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
        visible: __RELEASE_ENV__ !== 'production',
      },
    ],
  })

  template.push({
    label: __DARWIN__ ? 'Repository' : '&Repository',
    id: 'repository',
    submenu: [
      {
        id: 'push',
        label: __DARWIN__ ? 'Push' : 'P&ush',
        accelerator: 'CmdOrCtrl+P',
        click: emit('push'),
      },
      {
        id: 'pull',
        label: __DARWIN__ ? 'Pull' : 'Pu&ll',
        accelerator: 'CmdOrCtrl+Shift+P',
        click: emit('pull'),
      },
      {
        label: __DARWIN__ ? 'Remove' : '&Remove',
        id: 'remove-repository',
        click: emit('remove-repository'),
      },
      separator,
      {
        id: 'view-repository-on-github',
        label: __DARWIN__ ? 'View on GitHub' : '&View on GitHub',
        accelerator: 'CmdOrCtrl+Alt+G',
        click: emit('view-repository-on-github'),
      },
      {
        label: __DARWIN__ ? 'Open in Terminal' : 'Op&en command prompt',
        id: 'open-in-shell',
        click: emit('open-in-shell'),
      },
      {
        label: __DARWIN__ ? 'Open in Finder' : '&Open in Explorer',
        id: 'open-working-directory',
        accelerator: 'CmdOrCtrl+Shift+F',
        click: emit('open-working-directory'),
      },
      separator,
      {
        label: __DARWIN__ ? 'Repository Settings…' : 'Repository &settings…',
        id: 'show-repository-settings',
        click: emit('show-repository-settings'),
      },
    ],
  })

  template.push({
    label: __DARWIN__ ? 'Branch' : '&Branch',
    id: 'branch',
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
      separator,
      {
        label: __DARWIN__ ? 'Update From Default Branch' : '&Update from default branch',
        id: 'update-branch',
        click: emit('update-branch'),
      },
      {
        label: __DARWIN__ ? 'Merge Into Current Branch…' : '&Merge into current branch…',
        id: 'merge-branch',
        click: emit('merge-branch'),
      },
      separator,
      {
        label: __DARWIN__ ? 'Compare on GitHub' : '&Compare on GitHub',
        id: 'compare-branch',
        accelerator: 'CmdOrCtrl+Shift+C',
        click: emit('compare-branch'),
      },
    ],
  })

  if (__DARWIN__) {
    template.push({
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
        separator,
        { role: 'front' },
      ],
    })
  }

  const submitIssueItem: Electron.MenuItemOptions = {
    label: __DARWIN__ ? 'Report Issue…' : 'Report issue…',
    click() {
      shell.openExternal('https://github.com/desktop/desktop/issues/new')
    },
  }

  const showLogsItem: Electron.MenuItemOptions = {
    label: __DARWIN__ ? 'Show Logs in Finder' : 'S&how logs in Explorer',
    click() {
      const path = Path.join(app.getPath('userData'), LogFolder)
      shell.showItemInFolder(path)
    },
  }

  const helpItems = [
    submitIssueItem,
    showLogsItem,
  ]

  if (__DEV__) {
    const throwUnhandledError: Electron.MenuItemOptions = {
      label: 'Boomtown…',
      click () {
        throw new Error('Boomtown!')
      },
    }

    helpItems.push(throwUnhandledError)
  }

  if (__DARWIN__) {
    template.push({
      role: 'help',
      submenu: helpItems,
    })
  } else {
    template.push({
      label: '&Help',
      submenu: [
        ...helpItems,
        separator,
        { label: '&About GitHub Desktop', click: emit('show-about') },
      ],
    })
  }

  ensureItemIds(template)

  return Menu.buildFromTemplate(template)
}

type ClickHandler = (menuItem: Electron.MenuItem, browserWindow: Electron.BrowserWindow, event: Electron.Event) => void

/**
 * Utility function returning a Click event handler which, when invoked, emits
 * the provided menu event over IPC.
 */
function emit(name: MenuEvent): ClickHandler {
  return (menuItem, window) => {
    if (window) {
      window.webContents.send('menu-event', { name })
    } else {
      ipcMain.emit('menu-event', { name })
    }
  }
}
