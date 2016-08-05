import { shell, Menu, ipcMain } from 'electron'
import SharedProcess from '../shared-process/shared-process'

export type MenuEvent = 'push' | 'pull' | 'select-changes' | 'select-history' |
                        'create-branch'

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
          }
        },
      ]
    },
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
          label: 'Changes',
          accelerator: 'CmdOrCtrl+1',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('select-changes')
          }
        },
        {
          label: 'History',
          accelerator: 'CmdOrCtrl+2',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('select-history')
          }
        },
        {
          type: 'separator'
        },
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
            emitMenuEvent('push')
          }
        },
        {
          label: 'Pull',
          accelerator: 'CmdOrCtrl+Shift+P',
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            emitMenuEvent('pull')
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

function emitMenuEvent(name: MenuEvent) {
  ipcMain.emit('menu-event', { name })
}
