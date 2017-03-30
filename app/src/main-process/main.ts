import { app, Menu, MenuItem, ipcMain, BrowserWindow } from 'electron'
import * as http from 'http'

import { decode } from 'iconv-lite'
import { AppWindow } from './app-window'
import { buildDefaultMenu, MenuEvent, findMenuItemByID } from './menu'
import { parseURL } from '../lib/parse-url'
import { handleSquirrelEvent } from './squirrel-updater'
import { SharedProcess } from '../shared-process/shared-process'
import { fatalError } from '../lib/fatal-error'
import { reportError } from '../lib/exception-reporting'
import { IHTTPRequest, IHTTPResponse, getEncoding } from '../lib/http'

import { getLogger } from '../lib/logging/main'

let mainWindow: AppWindow | null = null
let sharedProcess: SharedProcess | null = null

let network: Electron.Net | null = null

const launchTime = Date.now()

let readyTime: number | null = null

process.on('uncaughtException', (error: Error) => {
  if (sharedProcess) {
    sharedProcess.console.error('Uncaught exception:')
    sharedProcess.console.error(error.name)
    sharedProcess.console.error(error.message)
  }

  getLogger().error('Uncaught exception on main process', error)

  reportError(error, app.getVersion())
})

if (__WIN32__ && process.argv.length > 1) {
  if (handleSquirrelEvent(process.argv[1])) {
    app.quit()
  }
}

const shouldQuit = app.makeSingleInstance((commandLine, workingDirectory) => {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  }

  // look at the second argument received, it should have the OAuth
  // callback contents and code for us to complete the signin flow
  if (commandLine.length > 1) {
    const action = parseURL(commandLine[1])
    getMainWindow().sendURLAction(action)
  }
})

if (shouldQuit) {
  app.quit()
}

app.on('ready', () => {
  const now = Date.now()
  readyTime = now - launchTime

  app.setAsDefaultProtocolClient('x-github-client')
  // Also support Desktop Classic's protocols.
  if (__DARWIN__) {
    app.setAsDefaultProtocolClient('github-mac')
  } else if (__WIN32__) {
    app.setAsDefaultProtocolClient('github-windows')
  }

  sharedProcess = new SharedProcess()
  sharedProcess.register()

  createWindow()

  app.on('open-url', (event, url) => {
    event.preventDefault()

    const action = parseURL(url)
    const window = getMainWindow()
    // This manual focus call _shouldn't_ be necessary, but is for Chrome on
    // macOS. See https://github.com/desktop/desktop/issues/973.
    window.focus()
    window.sendURLAction(action)
  })

  const menu = buildDefaultMenu(sharedProcess)
  Menu.setApplicationMenu(menu)

  ipcMain.on('menu-event', (event, args) => {
    const { name }: { name: MenuEvent } = event as any
    if (mainWindow) {
      mainWindow.sendMenuEvent(name)
    }
  })

  /**
   * An event sent by the renderer asking that the menu item with the given id
   * is executed (ie clicked).
   */
  ipcMain.on('execute-menu-item', (event: Electron.IpcMainEvent, { id }: { id: string }) => {
    const menuItem = findMenuItemByID(menu, id)
    if (menuItem) {
      const window = BrowserWindow.fromWebContents(event.sender)
      const fakeEvent = { preventDefault: () => {}, sender: event.sender }
      menuItem.click(fakeEvent, window, event.sender)
    }
  })

  ipcMain.on('set-menu-enabled', (event: Electron.IpcMainEvent, { id, enabled }: { id: string, enabled: boolean }) => {
    const menuItem = findMenuItemByID(menu, id)
    if (menuItem) {
      // Only send the updated app menu when the state actually changes
      // or we might end up introducing a never ending loop between
      // the renderer and the main process
      if (menuItem.enabled !== enabled) {
        menuItem.enabled = enabled
        if (mainWindow) {
          mainWindow.sendAppMenu()
        }
      }
    } else {
      fatalError(`Unknown menu id: ${id}`)
    }
  })

  ipcMain.on('set-menu-visible', (event: Electron.IpcMainEvent, { id, visible }: { id: string, visible: boolean }) => {
    const menuItem = findMenuItemByID(menu, id)
    if (menuItem) {
      // Only send the updated app menu when the state actually changes
      // or we might end up introducing a never ending loop between
      // the renderer and the main process
      if (menuItem.visible !== visible) {
        menuItem.visible = visible
        if (mainWindow) {
          mainWindow.sendAppMenu()
        }
      }
    } else {
      fatalError(`Unknown menu id: ${id}`)
    }
  })

  ipcMain.on('show-contextual-menu', (event: Electron.IpcMainEvent, items: ReadonlyArray<any>) => {
    const menu = new Menu()
    const menuItems = items.map((item, i) => {
      return new MenuItem({
        label: item.label,
        click: () => event.sender.send('contextual-menu-action', i),
        type: item.type,
        enabled: item.enabled,
      })
    })

    for (const item of menuItems) {
      menu.append(item)
    }

    const window = BrowserWindow.fromWebContents(event.sender)
    // TODO: read https://github.com/desktop/desktop/issues/1003
    // to clean up this sin against T Y P E S
    const anyMenu: any = menu
    anyMenu.popup(window, { async: true })
  })

  ipcMain.on('proxy/request', (event: Electron.IpcMainEvent, { id, options }: { id: string, options: IHTTPRequest }) => {

    if (network === null) {
      // the network module can only be resolved after the app is ready
      network = require('electron').net

      if (network === null) {
        sharedProcess!.console.error('Electron net module not resolved, should never be in this state')
        return
      }
    }

    const channel = `proxy/response/${id}`

    const requestOptions = {
      url: options.url,
      headers: options.headers,
      method: options.method,
    }

    const request = network.request(requestOptions)
    request.on('response', (response: Electron.IncomingMessage) => {

      const responseChunks: Array<Buffer> = [ ]

      response.on('abort', () => {
        event.sender.send(channel, { error: new Error('request aborted by the client') })
      })

      response.on('data', (chunk: Buffer) => {
        // rather than decode the bytes immediately, push them onto an array
        // and defer this until the entire response has been received
        responseChunks.push(chunk)
      })

      response.on('end', () => {
        const statusCode = response.statusCode
        const headers = response.headers
        const encoding = getEncoding(response) || 'binary'

        let body: string | undefined

        if (responseChunks.length > 0) {
          const buffer = Buffer.concat(responseChunks)
          try {
            // we're using `iconv-lite` to decode these buffers into an encoding specified
            // with user input - this will throw if it doesn't recognise the encoding
            body = decode(buffer, encoding)
          } catch (e) {
            sharedProcess!.console.log(`Unable to convert buffer to encoding: '${encoding}'`)
          }
        }

        // emulating the rules from got for propagating errors
        // source: https://github.com/sindresorhus/got/blob/88a8ac8ac3d8ee2387983048368205c0bbe4abdf/index.js#L352-L357
        let error: Error | undefined
        if (statusCode >= 400) {
          const statusMessage = http.STATUS_CODES[statusCode]
          error = new Error(`Response code ${statusCode} (${statusMessage})`)
        }

        const payload: IHTTPResponse = {
          statusCode,
          headers,
          body,
          error,
        }

        event.sender.send(channel, { response: payload })
      })
    })

    request.on('abort', () => {
      event.sender.send(channel, { error: new Error('request aborted by the client') })
    })

    request.on('aborted', () => {
      event.sender.send(channel, { error: new Error('request aborted by the server') })
    })

    const body = options.body
      ? JSON.stringify(options.body)
      : undefined

    request.end(body)
  })

  /**
   * An event sent by the renderer asking for a copy of the current
   * application menu.
   */
  ipcMain.on('get-app-menu', () => {
    if (mainWindow) {
      mainWindow.sendAppMenu()
    }
  })
})

app.on('activate', () => {
  if (!mainWindow) {
    createWindow()
  }
})

app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, url) => {
    // Prevent links or window.open from opening new windows
    event.preventDefault()
    sharedProcess!.console.log(`Prevented new window to: ${url}`)
  })
})

function createWindow() {
  const window = new AppWindow(sharedProcess!)

  if (__DEV__) {
    const installer = require('electron-devtools-installer')
    require('electron-debug')({ showDevTools: true })

    const extensions = [
      'REACT_DEVELOPER_TOOLS',
      'REACT_PERF',
    ]

    for (const name of extensions) {
      try {
        installer.default(installer[name])
      } catch (e) {}
    }
  }

  window.onClose(() => {
    mainWindow = null

    if (!__DARWIN__) {
      app.quit()
    }
  })

  window.onDidLoad(() => {
    window.show()
    window.sendLaunchTimingStats({
      mainReadyTime: readyTime!,
      loadTime: window.loadTime!,
      rendererReadyTime: window.rendererReadyTime!,
    })
  })

  window.load()

  mainWindow = window
}

/** Get the main window, creating it if necessary. */
function getMainWindow(): AppWindow {
  if (!mainWindow) {
    createWindow()
  }

  return mainWindow!
}
