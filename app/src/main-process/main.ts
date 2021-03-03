import '../lib/logging/main/install'

import { app, Menu, ipcMain, BrowserWindow, shell } from 'electron'
import * as Fs from 'fs'
import * as URL from 'url'

import { MenuLabelsEvent } from '../models/menu-labels'

import { AppWindow } from './app-window'
import { buildDefaultMenu, MenuEvent, getAllMenuItems } from './menu'
import { shellNeedsPatching, updateEnvironmentForProcess } from '../lib/shell'
import { parseAppURL } from '../lib/parse-app-url'
import { handleSquirrelEvent } from './squirrel-updater'
import { fatalError } from '../lib/fatal-error'

import { IMenuItemState } from '../lib/menu-update'
import { LogLevel } from '../lib/logging/log-level'
import { log as writeLog } from './log'
import { UNSAFE_openDirectory } from './shell'
import { reportError } from './exception-reporting'
import {
  enableSourceMaps,
  withSourceMappedStack,
} from '../lib/source-map-support'
import { now } from './now'
import { showUncaughtException } from './show-uncaught-exception'
import { ISerializableMenuItem } from '../lib/menu-item'
import { buildContextMenu } from './menu/build-context-menu'
import { stat } from 'fs-extra'
import { isApplicationBundle } from '../lib/is-application-bundle'

app.setAppLogsPath()
enableSourceMaps()

let mainWindow: AppWindow | null = null

const launchTime = now()

let preventQuit = false
let readyTime: number | null = null

type OnDidLoadFn = (window: AppWindow) => void
/** See the `onDidLoad` function. */
let onDidLoadFns: Array<OnDidLoadFn> | null = []

function handleUncaughtException(error: Error) {
  preventQuit = true

  // If we haven't got a window we'll assume it's because
  // we've just launched and haven't created it yet.
  // It could also be because we're encountering an unhandled
  // exception on shutdown but that's less likely and since
  // this only affects the presentation of the crash dialog
  // it's a safe assumption to make.
  const isLaunchError = mainWindow === null

  if (mainWindow) {
    mainWindow.destroy()
    mainWindow = null
  }

  showUncaughtException(isLaunchError, error)
}

/**
 * Calculates the number of seconds the app has been running
 */
function getUptimeInSeconds() {
  return (now() - launchTime) / 1000
}

function getExtraErrorContext(): Record<string, string> {
  return {
    uptime: getUptimeInSeconds().toFixed(3),
    time: new Date().toString(),
  }
}

/** Extra argument for the protocol launcher on Windows */
const protocolLauncherArg = '--protocol-launcher'

const possibleProtocols = new Set(['x-github-client'])
if (__DEV__) {
  possibleProtocols.add('x-github-desktop-dev-auth')
} else {
  possibleProtocols.add('x-github-desktop-auth')
}
// Also support Desktop Classic's protocols.
if (__DARWIN__) {
  possibleProtocols.add('github-mac')
} else if (__WIN32__) {
  possibleProtocols.add('github-windows')
}

app.on('window-all-closed', () => {
  // If we don't subscribe to this event and all windows are closed, the default
  // behavior is to quit the app. We don't want that though, we control that
  // behavior through the mainWindow onClose event such that on macOS we only
  // hide the main window when a user attempts to close it.
  //
  // If we don't subscribe to this and change the default behavior we break
  // the crash process window which is shown after the main window is closed.
})

process.on('uncaughtException', (error: Error) => {
  error = withSourceMappedStack(error)
  reportError(error, getExtraErrorContext())
  handleUncaughtException(error)
})

let handlingSquirrelEvent = false
if (__WIN32__ && process.argv.length > 1) {
  const arg = process.argv[1]

  const promise = handleSquirrelEvent(arg)
  if (promise) {
    handlingSquirrelEvent = true
    promise
      .catch(e => {
        log.error(`Failed handling Squirrel event: ${arg}`, e)
      })
      .then(() => {
        app.quit()
      })
  } else {
    handlePossibleProtocolLauncherArgs(process.argv)
  }
}

function handleAppURL(url: string) {
  log.info('Processing protocol url')
  const action = parseAppURL(url)
  onDidLoad(window => {
    // This manual focus call _shouldn't_ be necessary, but is for Chrome on
    // macOS. See https://github.com/desktop/desktop/issues/973.
    window.focus()
    window.sendURLAction(action)
  })
}

let isDuplicateInstance = false
// If we're handling a Squirrel event we don't want to enforce single instance.
// We want to let the updated instance launch and do its work. It will then quit
// once it's done.
if (!handlingSquirrelEvent) {
  const gotSingleInstanceLock = app.requestSingleInstanceLock()
  isDuplicateInstance = !gotSingleInstanceLock

  app.on('second-instance', (event, args, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }

      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }

      mainWindow.focus()
    }

    handlePossibleProtocolLauncherArgs(args)
  })

  if (isDuplicateInstance) {
    app.quit()
  }
}

if (shellNeedsPatching(process)) {
  updateEnvironmentForProcess()
}

app.on('will-finish-launching', () => {
  // macOS only
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAppURL(url)
  })
})

if (__DARWIN__) {
  app.on('open-file', async (event, path) => {
    event.preventDefault()

    log.info(`[main] a path to ${path} was triggered`)

    Fs.stat(path, (err, stats) => {
      if (err) {
        log.error(`Unable to open path '${path}' in Desktop`, err)
        return
      }

      if (stats.isFile()) {
        log.warn(
          `A file at ${path} was dropped onto Desktop, but it can only handle folders. Ignoring this action.`
        )
        return
      }

      handleAppURL(
        `x-github-client://openLocalRepo/${encodeURIComponent(path)}`
      )
    })
  })
}

/**
 * Attempt to detect and handle any protocol handler arguments passed
 * either via the command line directly to the current process or through
 * IPC from a duplicate instance (see makeSingleInstance)
 *
 * @param args Essentially process.argv, i.e. the first element is the exec
 *             path
 */
function handlePossibleProtocolLauncherArgs(args: ReadonlyArray<string>) {
  log.info(`Received possible protocol arguments: ${args.length}`)

  if (__WIN32__) {
    // Desktop registers it's protocol handler callback on Windows as
    // `[executable path] --protocol-launcher "%1"`. Note that extra command
    // line arguments might be added by Chromium
    // (https://electronjs.org/docs/api/app#event-second-instance).
    // At launch Desktop checks for that exact scenario here before doing any
    // processing. If there's more than one matching url argument because of a
    // malformed or untrusted url then we bail out.

    const matchingUrls = args.filter(arg => {
      // sometimes `URL.parse` throws an error
      try {
        const url = URL.parse(arg)
        // i think this `slice` is just removing a trailing `:`
        return url.protocol && possibleProtocols.has(url.protocol.slice(0, -1))
      } catch (e) {
        log.error(`Unable to parse argument as URL: ${arg}`)
        return false
      }
    })

    if (args.includes(protocolLauncherArg) && matchingUrls.length === 1) {
      handleAppURL(matchingUrls[0])
    } else {
      log.error(`Malformed launch arguments received: ${args}`)
    }
  } else if (args.length > 1) {
    handleAppURL(args[1])
  }
}

/**
 * Wrapper around app.setAsDefaultProtocolClient that adds our
 * custom prefix command line switches on Windows.
 */
function setAsDefaultProtocolClient(protocol: string) {
  if (__WIN32__) {
    app.setAsDefaultProtocolClient(protocol, process.execPath, [
      protocolLauncherArg,
    ])
  } else {
    app.setAsDefaultProtocolClient(protocol)
  }
}

if (process.env.GITHUB_DESKTOP_DISABLE_HARDWARE_ACCELERATION) {
  log.info(
    `GITHUB_DESKTOP_DISABLE_HARDWARE_ACCELERATION environment variable set, disabling hardware acceleration`
  )
  app.disableHardwareAcceleration()
}

app.on('ready', () => {
  if (isDuplicateInstance || handlingSquirrelEvent) {
    return
  }

  readyTime = now() - launchTime

  possibleProtocols.forEach(protocol => setAsDefaultProtocolClient(protocol))

  createWindow()

  Menu.setApplicationMenu(
    buildDefaultMenu({
      selectedShell: null,
      selectedExternalEditor: null,
      askForConfirmationOnRepositoryRemoval: false,
      askForConfirmationOnForcePush: false,
    })
  )

  ipcMain.on(
    'update-preferred-app-menu-item-labels',
    (event: Electron.IpcMainEvent, labels: MenuLabelsEvent) => {
      // The current application menu is mutable and we frequently
      // change whether particular items are enabled or not through
      // the update-menu-state IPC event. This menu that we're creating
      // now will have all the items enabled so we need to merge the
      // current state with the new in order to not get a temporary
      // race conditions where menu items which shouldn't be enabled
      // are.
      const newMenu = buildDefaultMenu(labels)

      const currentMenu = Menu.getApplicationMenu()

      // This shouldn't happen but whenever one says that it does
      // so here's the escape hatch when we can't merge the current
      // menu with the new one; we just use the new one.
      if (currentMenu === null) {
        // https://github.com/electron/electron/issues/2717
        Menu.setApplicationMenu(newMenu)

        if (mainWindow !== null) {
          mainWindow.sendAppMenu()
        }

        return
      }

      // It's possible that after rebuilding the menu we'll end up
      // with the exact same structural menu as we had before so we
      // keep track of whether anything has actually changed in order
      // to avoid updating the global menu and telling the renderer
      // about it.
      let menuHasChanged = false

      for (const newItem of getAllMenuItems(newMenu)) {
        // Our menu items always have ids and Electron.MenuItem takes on whatever
        // properties was defined on the MenuItemOptions template used to create it
        // but doesn't surface those in the type declaration.
        const id = (newItem as any).id

        if (!id) {
          continue
        }

        const currentItem = currentMenu.getMenuItemById(id)

        // Unfortunately the type information for getMenuItemById
        // doesn't specify if it'll return null or undefined when
        // the item doesn't exist so we'll do a falsy check here.
        if (!currentItem) {
          menuHasChanged = true
        } else {
          if (currentItem.label !== newItem.label) {
            menuHasChanged = true
          }

          // Copy the enabled property from the existing menu
          // item since it'll be the most recent reflection of
          // what the renderer wants.
          if (currentItem.enabled !== newItem.enabled) {
            newItem.enabled = currentItem.enabled
            menuHasChanged = true
          }
        }
      }

      if (menuHasChanged && mainWindow) {
        // https://github.com/electron/electron/issues/2717
        Menu.setApplicationMenu(newMenu)
        mainWindow.sendAppMenu()
      }
    }
  )

  ipcMain.on('menu-event', (event: Electron.IpcMainEvent, args: any[]) => {
    const { name }: { name: MenuEvent } = event as any
    if (mainWindow) {
      mainWindow.sendMenuEvent(name)
    }
  })

  /**
   * An event sent by the renderer asking that the menu item with the given id
   * is executed (ie clicked).
   */
  ipcMain.on(
    'execute-menu-item',
    (event: Electron.IpcMainEvent, { id }: { id: string }) => {
      const currentMenu = Menu.getApplicationMenu()

      if (currentMenu === null) {
        return
      }

      const menuItem = currentMenu.getMenuItemById(id)
      if (menuItem) {
        const window = BrowserWindow.fromWebContents(event.sender) || undefined
        const fakeEvent = { preventDefault: () => {}, sender: event.sender }
        menuItem.click(fakeEvent, window, event.sender)
      }
    }
  )

  ipcMain.on(
    'update-menu-state',
    (
      event: Electron.IpcMainEvent,
      items: Array<{ id: string; state: IMenuItemState }>
    ) => {
      let sendMenuChangedEvent = false

      const currentMenu = Menu.getApplicationMenu()

      if (currentMenu === null) {
        log.debug(`unable to get current menu, bailing out...`)
        return
      }

      for (const item of items) {
        const { id, state } = item

        const menuItem = currentMenu.getMenuItemById(id)

        if (menuItem) {
          // Only send the updated app menu when the state actually changes
          // or we might end up introducing a never ending loop between
          // the renderer and the main process
          if (
            state.enabled !== undefined &&
            menuItem.enabled !== state.enabled
          ) {
            menuItem.enabled = state.enabled
            sendMenuChangedEvent = true
          }
        } else {
          fatalError(`Unknown menu id: ${id}`)
        }
      }

      if (sendMenuChangedEvent && mainWindow) {
        Menu.setApplicationMenu(currentMenu)
        mainWindow.sendAppMenu()
      }
    }
  )

  /**
   * Handle the action to show a contextual menu.
   *
   * It responds an array of indices that maps to the path to reach
   * the menu (or submenu) item that was clicked or null if the menu
   * was closed without clicking on any item.
   */
  ipcMain.handle(
    'show-contextual-menu',
    (
      event: Electron.IpcMainInvokeEvent,
      items: ReadonlyArray<ISerializableMenuItem>
    ): Promise<ReadonlyArray<number> | null> => {
      return new Promise(resolve => {
        const menu = buildContextMenu(items, indices => resolve(indices))
        const window = BrowserWindow.fromWebContents(event.sender) || undefined

        menu.popup({ window, callback: () => resolve(null) })
      })
    }
  )

  /**
   * An event sent by the renderer asking for a copy of the current
   * application menu.
   */
  ipcMain.on('get-app-menu', () => {
    if (mainWindow) {
      mainWindow.sendAppMenu()
    }
  })

  ipcMain.on(
    'show-certificate-trust-dialog',
    (
      event: Electron.IpcMainEvent,
      {
        certificate,
        message,
      }: { certificate: Electron.Certificate; message: string }
    ) => {
      // This API is only implemented for macOS and Windows right now.
      if (__DARWIN__ || __WIN32__) {
        onDidLoad(window => {
          window.showCertificateTrustDialog(certificate, message)
        })
      }
    }
  )

  ipcMain.on(
    'log',
    (event: Electron.IpcMainEvent, level: LogLevel, message: string) => {
      writeLog(level, message)
    }
  )

  ipcMain.on(
    'uncaught-exception',
    (event: Electron.IpcMainEvent, error: Error) => {
      handleUncaughtException(error)
    }
  )

  ipcMain.on(
    'send-error-report',
    (
      event: Electron.IpcMainEvent,
      {
        error,
        extra,
        nonFatal,
      }: { error: Error; extra: { [key: string]: string }; nonFatal?: boolean }
    ) => {
      reportError(
        error,
        {
          ...getExtraErrorContext(),
          ...extra,
        },
        nonFatal
      )
    }
  )

  ipcMain.on(
    'open-external',
    async (event: Electron.IpcMainEvent, { path }: { path: string }) => {
      const pathLowerCase = path.toLowerCase()
      if (
        pathLowerCase.startsWith('http://') ||
        pathLowerCase.startsWith('https://')
      ) {
        log.info(`opening in browser: ${path}`)
      }

      let result
      try {
        await shell.openExternal(path)
        result = true
      } catch (e) {
        log.error(`Call to openExternal failed: '${e}'`)
        result = false
      }
      event.sender.send('open-external-result', { result })
    }
  )

  ipcMain.on(
    'show-item-in-folder',
    (event: Electron.IpcMainEvent, { path }: { path: string }) => {
      Fs.stat(path, err => {
        if (err) {
          log.error(`Unable to find file at '${path}'`, err)
          return
        }
        shell.showItemInFolder(path)
      })
    }
  )

  ipcMain.on(
    'show-folder-contents',
    async (event: Electron.IpcMainEvent, { path }: { path: string }) => {
      const stats = await stat(path).catch(err => {
        log.error(`Unable to retrieve file information for ${path}`, err)
        return null
      })

      if (!stats) {
        return
      }

      if (!stats.isDirectory()) {
        log.error(
          `Trying to get the folder contents of a non-folder at '${path}'`
        )
        shell.showItemInFolder(path)
        return
      }

      // On Windows and Linux we can count on a directory being just a
      // directory.
      if (!__DARWIN__) {
        UNSAFE_openDirectory(path)
        return
      }

      // On macOS a directory might also be an app bundle and if it is
      // and we attempt to open it we're gonna execute that app which
      // it far from ideal so we'll look up the metadata for the path
      // and attempt to determine whether it's an app bundle or not.
      //
      // If we fail loading the metadata we'll assume it's an app bundle
      // out of an abundance of caution.
      const isBundle = await isApplicationBundle(path).catch(err => {
        log.error(`Failed to load metadata for path '${path}'`, err)
        return true
      })

      if (isBundle) {
        log.info(
          `Preventing direct open of path '${path}' as it appears to be an application bundle`
        )

        shell.showItemInFolder(path)
      } else {
        UNSAFE_openDirectory(path)
      }
    }
  )
})

app.on('activate', () => {
  onDidLoad(window => {
    window.show()
  })
})

app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, url) => {
    // Prevent links or window.open from opening new windows
    event.preventDefault()
    log.warn(`Prevented new window to: ${url}`)
  })
  // prevent link navigation within our windows
  // see https://www.electronjs.org/docs/tutorial/security#12-disable-or-limit-navigation
  contents.on('will-navigate', (event, url) => {
    event.preventDefault()
    log.warn(`Prevented navigation to: ${url}`)
  })
})

app.on(
  'certificate-error',
  (event, webContents, url, error, certificate, callback) => {
    callback(false)

    onDidLoad(window => {
      window.sendCertificateError(certificate, error, url)
    })
  }
)

function createWindow() {
  const window = new AppWindow()

  if (__DEV__) {
    const {
      default: installExtension,
      REACT_DEVELOPER_TOOLS,
    } = require('electron-devtools-installer')

    require('electron-debug')({ showDevTools: true })

    const ChromeLens = {
      id: 'idikgljglpfilbhaboonnpnnincjhjkd',
      electron: '>=1.2.1',
    }

    const extensions = [REACT_DEVELOPER_TOOLS, ChromeLens]

    for (const extension of extensions) {
      try {
        installExtension(extension)
      } catch (e) {}
    }
  }

  window.onClose(() => {
    mainWindow = null
    if (!__DARWIN__ && !preventQuit) {
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

    const fns = onDidLoadFns!
    onDidLoadFns = null
    for (const fn of fns) {
      fn(window)
    }
  })

  window.load()

  mainWindow = window
}

/**
 * Register a function to be called once the window has been loaded. If the
 * window has already been loaded, the function will be called immediately.
 */
function onDidLoad(fn: OnDidLoadFn) {
  if (onDidLoadFns) {
    onDidLoadFns.push(fn)
  } else {
    if (mainWindow) {
      fn(mainWindow)
    }
  }
}
