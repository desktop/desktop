import { app, Menu, MenuItem, ipcMain, BrowserWindow } from 'electron'
import * as http from 'http'

import { AppWindow } from './app-window'
import { buildDefaultMenu, MenuEvent, findMenuItemByID } from './menu'
import { parseURL } from '../lib/parse-url'
import { handleSquirrelEvent } from './updates'
import { SharedProcess } from '../shared-process/shared-process'
import { fatalError } from '../lib/fatal-error'
import { reportError } from '../lib/exception-reporting'
import { IHTTPRequest, IHTTPResponse } from '../lib/http'

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
    getMainWindow().sendURLAction(action)
  })

  const menu = buildDefaultMenu(sharedProcess)
  Menu.setApplicationMenu(menu)

  ipcMain.on('menu-event', (event, args) => {
    const { name }: { name: MenuEvent } = event as any
    if (mainWindow) {
      mainWindow.sendMenuEvent(name)
    }
  })

  ipcMain.on('set-menu-enabled', (event: Electron.IpcMainEvent, { id, enabled }: { id: string, enabled: boolean }) => {
    const menuItem = findMenuItemByID(menu, id)
    if (menuItem) {
      menuItem.enabled = enabled
    } else {
      fatalError(`Unknown menu id: ${id}`)
    }
  })

  ipcMain.on('set-menu-visible', (event: Electron.IpcMainEvent, { id, visible }: { id: string, visible: boolean }) => {
    const menuItem = findMenuItemByID(menu, id)
    if (menuItem) {
      menuItem.visible = visible
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
      })
    })

    for (const item of menuItems) {
      menu.append(item)
    }

    const window = BrowserWindow.fromWebContents(event.sender)
    menu.popup(window)
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

      let text: string = ''

      response.on('abort', () => {
        event.sender.send(channel, { error: new Error('request aborted by the client') })
      })

      response.on('data', (chunk: Buffer) => {
        text += chunk
      })

      response.on('end', () => {

        const statusCode = response.statusCode
        const headers = response.headers

        let body: Object | undefined
        // there's more to do here around parsing the body
        // but for now this works around a joke that has been placed on me
        if (statusCode !== 204 && text.length > 0) {
          try {
            body = JSON.parse(text)
          } catch (e) {
            sharedProcess!.console.log(`JSON.parse failed for: '${text}'`)
            sharedProcess!.console.log(`Headers: '${JSON.stringify(response.headers)}'`)
          }
        }

        // emulating the rules from got for propagating errors
        // source: https://github.com/sindresorhus/got/blob/88a8ac8ac3d8ee2387983048368205c0bbe4abdf/index.js#L352-L357
        let error: Error | undefined
        if (statusCode < 200 || statusCode >= 400) {
          const statusMessage = http.STATUS_CODES[statusCode]
          error = new Error(`Response code ${statusCode} (${statusMessage})`)
        }

        const payload: IHTTPResponse = {
          statusCode,
          headers,
          body,
          error
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
})

app.on('activate', () => {
  if (!mainWindow) {
    createWindow()
  }
})

function createWindow() {
  const window = new AppWindow(sharedProcess!)
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
