import {app, shell, Menu} from 'electron'
import SharedProcess from '../shared-process/shared-process'

export function buildDefaultMenu(sharedProcess: SharedProcess): Electron.Menu {
  const template: Object[] = [
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo'
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          role: 'redo'
        },
        {
          type: 'separator'
        },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          role: 'cut'
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy'
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          role: 'paste'
        },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
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
          label: 'Toggle Full Screen',
          accelerator: (() => {
            return (process.platform === 'darwin') ? 'Ctrl+Command+F' : 'F11'
          })(),
          click (item: any, focusedWindow: Electron.BrowserWindow) {
            if (focusedWindow) {
              focusedWindow.setFullScreen(!focusedWindow.isFullScreen())
            }
          }
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
      label: 'Window',
      role: 'window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    },
    {
      label: 'Help',
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
          label: 'About GitHub',
          role: 'about'
        },
        {
          type: 'separator'
        },
        {
          label: 'Services',
          role: 'services',
          submenu: []
        },
        {
          type: 'separator'
        },
        {
          label: 'Hide GitHub',
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Alt+H',
          role: 'hideothers'
        },
        {
          label: 'Show All',
          role: 'unhide'
        },
        {
          type: 'separator'
        },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click () { app.quit() }
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
        label: 'Bring All to Front',
        role: 'front'
      }
    )
  }

  return Menu.buildFromTemplate(template)
}
