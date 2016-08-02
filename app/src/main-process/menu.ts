import { shell, Menu, ipcMain } from 'electron'
import SharedProcess from '../shared-process/shared-process'

export type MenuEvent = 'push' | 'pull'

export function buildDefaultMenu(sharedProcess: SharedProcess): Electron.Menu {
  const template: Object[] = [
    {
      label: 'Edit',
      submenu: [
        {
          role: 'undo'
        },
        {
          role: 'redo'
        },
        {
          type: 'separator'
        },
        {
          role: 'cut'
        },
        {
          role: 'copy'
        },
        {
          role: 'paste'
        },
        {
          role: 'selectall'
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            if (focusedWindow) {
              focusedWindow.reload()
            }
          }
        },
        {
          role: 'togglefullscreen',
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: (() => {
            return (process.platform === 'darwin') ? 'Alt+Command+I' : 'Ctrl+Shift+I'
          })(),
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            if (focusedWindow) {
              focusedWindow.webContents.toggleDevTools()
            }
          }
        },
        {
          label: 'Debug shared process',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            sharedProcess.show()
          }
        }
      ]
    },
    {
      label: 'Repository',
      submenu: [
        {
          label: 'Push',
          accelerator: 'CmdOrCtrl+P',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            ipcMain.emit('menu-event', { name: 'push' })
          }
        },
        {
          label: 'Pull',
          accelerator: 'CmdOrCtrl+Shift+P',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            ipcMain.emit('menu-event', { name: 'pull' })
          }
        }
      ]
    },
    {
      role: 'window',
      submenu: [
        {
          role: 'minimize'
        },
        {
          role: 'close'
        }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Contact GitHub Support…',
          click () {
            shell.openExternal('https://github.com/support')
          }
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: 'GitHub',
      submenu: [
        {
          role: 'about'
        },
        {
          type: 'separator'
        },
        {
          role: 'services',
          submenu: []
        },
        {
          type: 'separator'
        },
        {
          role: 'hide'
        },
        {
          role: 'hideothers'
        },
        {
          role: 'unhide'
        },
        {
          type: 'separator'
        },
        {
          role: 'quit'
        }
      ]
    })

    const windowMenu = template[3] as {submenu: Object[]}
    const windowSubmenu = windowMenu.submenu
    windowSubmenu.push(
      {
        type: 'separator'
      },
      {
        role: 'front'
      }
    )
  }

  return Menu.buildFromTemplate(template)
}
