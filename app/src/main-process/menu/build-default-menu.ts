import { shell, Menu, ipcMain } from 'electron'
import { SharedProcess } from '../../shared-process/shared-process'
import { ensureItemIds } from './ensure-item-ids'
import { MenuEvent } from './menu-event'
import { getLogPath } from '../../lib/logging/get-log-path'
import { mkdirIfNeeded } from '../../lib/file-system'
import { log } from '../log'

export function buildDefaultMenu(sharedProcess: SharedProcess): Electron.Menu {
  const template = new Array<Electron.MenuItemConstructorOptions>()
  const separator: Electron.MenuItemConstructorOptions = { type: 'separator' }

  if (__DARWIN__) {
    template.push({
      label: 'GitHub Desktop',
      submenu: [
        {
          label: 'About GitHub Desktop',
          click: emit('show-about'),
          id: 'about',
        },
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

  const fileMenu: Electron.MenuItemConstructorOptions = {
    label: __DARWIN__ ? 'File' : '&File',
    submenu: [
      {
        label: __DARWIN__ ? 'New Repository…' : 'New &repository…',
        id: 'new-repository',
        click: emit('create-repository'),
        accelerator: 'CmdOrCtrl+N',
      },
      separator,
      {
        label: __DARWIN__ ? 'Add Local Repository…' : 'Add &local repository…',
        id: 'add-local-repository',
        accelerator: 'CmdOrCtrl+O',
        click: emit('add-local-repository'),
      },
      {
        label: __DARWIN__ ? 'Clone Repository…' : 'Clo&ne repository…',
        id: 'clone-repository',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: emit('clone-repository'),
      },
    ],
  }

  if (!__DARWIN__) {
    const fileItems = fileMenu.submenu as Electron.MenuItemConstructorOptions[]

    fileItems.push(
      separator,
      {
        label: '&Options…',
        id: 'preferences',
        accelerator: 'CmdOrCtrl+,',
        click: emit('show-preferences'),
      },
      separator,
      { role: 'quit' }
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
        label: __DARWIN__ ? 'Reset Zoom' : 'Reset zoom',
        accelerator: 'CmdOrCtrl+0',
        click: zoom(ZoomDirection.Reset),
      },
      {
        label: __DARWIN__ ? 'Zoom In' : 'Zoom in',
        accelerator: 'CmdOrCtrl+=',
        click: zoom(ZoomDirection.In),
      },
      {
        label: __DARWIN__ ? 'Zoom Out' : 'Zoom out',
        accelerator: 'CmdOrCtrl+-',
        click: zoom(ZoomDirection.Out),
      },
      separator,
      {
        label: '&Reload',
        id: 'reload-window',
        accelerator: 'CmdOrCtrl+R',
        click(item: any, focusedWindow: Electron.BrowserWindow) {
          if (focusedWindow) {
            focusedWindow.reload()
          }
        },
        visible: __RELEASE_ENV__ !== 'production',
      },
      {
        id: 'show-devtools',
        label: __DARWIN__
          ? 'Toggle Developer Tools'
          : '&Toggle developer tools',
        accelerator: (() => {
          return __DARWIN__ ? 'Alt+Command+I' : 'Ctrl+Shift+I'
        })(),
        click(item: any, focusedWindow: Electron.BrowserWindow) {
          if (focusedWindow) {
            focusedWindow.webContents.toggleDevTools()
          }
        },
      },
      {
        label: __DARWIN__ ? 'Debug Shared Process' : '&Debug shared process',
        click(item: any, focusedWindow: Electron.BrowserWindow) {
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
        label: __DARWIN__ ? 'Show in Finder' : 'Show in E&xplorer',
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
        label: __DARWIN__ ? 'New Branch…' : 'New &branch…',
        id: 'create-branch',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: emit('create-branch'),
      },
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
        label: __DARWIN__
          ? 'Update From Default Branch'
          : '&Update from default branch',
        id: 'update-branch',
        click: emit('update-branch'),
      },
      {
        label: __DARWIN__
          ? 'Merge Into Current Branch…'
          : '&Merge into current branch…',
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

  const submitIssueItem: Electron.MenuItemConstructorOptions = {
    label: __DARWIN__ ? 'Report Issue…' : 'Report issue…',
    click() {
      shell.openExternal('https://github.com/desktop/desktop/issues/new')
    },
  }

  const showUserGuides: Electron.MenuItemConstructorOptions = {
    label: 'Show User Guides',
    click() {
      shell.openExternal('https://help.github.com/desktop-beta/guides/')
    },
  }

  const showLogsItem: Electron.MenuItemConstructorOptions = {
    label: __DARWIN__ ? 'Show Logs in Finder' : 'S&how logs in Explorer',
    click() {
      const logPath = getLogPath()
      mkdirIfNeeded(logPath)
        .then(() => {
          shell.showItemInFolder(logPath)
        })
        .catch(err => {
          log('error', err.message)
        })
    },
  }

  const helpItems = [submitIssueItem, showUserGuides, showLogsItem]

  if (__DEV__) {
    helpItems.push(
      separator,
      {
        label: 'Crash main process…',
        click() {
          throw new Error('Boomtown!')
        },
      },
      {
        label: 'Crash renderer process…',
        click: emit('boomtown'),
      }
    )
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
        {
          label: '&About GitHub Desktop',
          click: emit('show-about'),
          id: 'about',
        },
      ],
    })
  }

  ensureItemIds(template)

  return Menu.buildFromTemplate(template)
}

type ClickHandler = (
  menuItem: Electron.MenuItem,
  browserWindow: Electron.BrowserWindow,
  event: Electron.Event
) => void

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

enum ZoomDirection {
  Reset,
  In,
  Out,
}

/** The zoom steps that we support, these factors must sorted */
const ZoomInFactors = [1, 1.1, 1.25, 1.5, 1.75, 2]
const ZoomOutFactors = ZoomInFactors.slice().reverse()

/**
 * Returns the element in the array that's closest to the value parameter. Note
 * that this function will throw if passed an empty array.
 */
function findClosestValue(arr: Array<number>, value: number) {
  return arr.reduce((previous, current) => {
    return Math.abs(current - value) < Math.abs(previous - value)
      ? current
      : previous
  })
}

/**
 * Figure out the next zoom level for the given direction and alert the renderer
 * about a change in zoom factor if necessary.
 */
function zoom(direction: ZoomDirection): ClickHandler {
  return (menuItem, window) => {
    if (!window) {
      return
    }

    const { webContents } = window

    if (direction === ZoomDirection.Reset) {
      webContents.setZoomFactor(1)
      webContents.send('zoom-factor-changed', 1)
    } else {
      webContents.getZoomFactor(rawZoom => {
        const zoomFactors =
          direction === ZoomDirection.In ? ZoomInFactors : ZoomOutFactors

        // So the values that we get from getZoomFactor are floating point
        // precision numbers from chromium that don't always round nicely so
        // we'll have to do a little trick to figure out which of our supported
        // zoom factors the value is referring to.
        const currentZoom = findClosestValue(zoomFactors, rawZoom)

        const nextZoomLevel = zoomFactors.find(
          f =>
            direction === ZoomDirection.In ? f > currentZoom : f < currentZoom
        )

        // If we couldn't find a zoom level (likely due to manual manipulation
        // of the zoom factor in devtools) we'll just snap to the closest valid
        // factor we've got.
        const newZoom =
          nextZoomLevel === undefined ? currentZoom : nextZoomLevel

        webContents.setZoomFactor(newZoom)
        webContents.send('zoom-factor-changed', newZoom)
      })
    }
  }
}
