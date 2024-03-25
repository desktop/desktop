import { ExecutableMenuItem } from '../models/app-menu'
import { RequestResponseChannels, RequestChannels } from '../lib/ipc-shared'
import * as ipcRenderer from '../lib/ipc-renderer'
import { stat } from 'fs/promises'
import { isApplicationBundle } from '../lib/is-application-bundle'
import { pathExists } from './lib/path-exists'

/**
 * Creates a strongly typed proxy method for sending a duplex IPC message to the
 * main process. The parameter types and return type are infered from the
 * RequestResponseChannels type which defines the valid duplex channel names.
 *
 * @param numArgs The number of arguments that the channel expects. We specify
 *                this so that we don't accidentally send more things over the
 *                IPC boundary than we intended to which can lead to runtime
 *                errors.
 *
 *                This is necessary because TypeScript allows passing more
 *                arguments than defined to functions which in turn means that
 *                functions without arguments are type compatible with all
 *                functions that share the same return type.
 */
export function invokeProxy<T extends keyof RequestResponseChannels>(
  channel: T,
  numArgs: ParameterCount<RequestResponseChannels[T]>
) {
  return (...args: Parameters<RequestResponseChannels[T]>) => {
    // This as any cast here may seem unsafe but it isn't since we're guaranteed
    // that numArgs will match the parameter count of the IPC declaration.
    args = args.length !== numArgs ? (args.slice(0, numArgs) as any) : args
    return ipcRenderer.invoke(channel, ...args)
  }
}

/**
 * Creates a strongly typed proxy method for sending a simplex IPC message to
 * the main process. The parameter types are infered from the
 * RequestResponseChannels type which defines the valid duplex channel names.
 *
 * @param numArgs The number of arguments that the channel expects. We specify
 *                this so that we don't accidentally send more things over the
 *                IPC boundary than we intended to which can lead to runtime
 *                errors.
 *
 *                This is necessary because TypeScript allows passing more
 *                arguments than defined to functions which in turn means that
 *                functions without arguments are type compatible with all
 *                functions that share the same return type.
 */
export function sendProxy<T extends keyof RequestChannels>(
  channel: T,
  numArgs: ParameterCount<RequestChannels[T]>
) {
  return (...args: Parameters<RequestChannels[T]>) => {
    // This as any cast here may seem unsafe but it isn't since we're guaranteed
    // that numArgs will match the parameter count of the IPC declaration.
    args = args.length !== numArgs ? (args.slice(0, numArgs) as any) : args
    ipcRenderer.send(channel, ...args)
  }
}

/**
 * Tell the main process to select all of the current web contents
 */
export const selectAllWindowContents = sendProxy(
  'select-all-window-contents',
  0
)

/** Set the menu item's enabledness. */
export const updateMenuState = sendProxy('update-menu-state', 1)

/** Tell the main process that the renderer is ready. */
export const sendReady = sendProxy('renderer-ready', 1)

/** Tell the main process to execute (i.e. simulate a click of) the menu item. */
export const executeMenuItem = (item: ExecutableMenuItem) =>
  executeMenuItemById(item.id)

/** Tell the main process to execute (i.e. simulate a click of) the menu item. */
export const executeMenuItemById = sendProxy('execute-menu-item-by-id', 1)

/**
 * Tell the main process to obtain whether the window is focused.
 */
export const isWindowFocused = invokeProxy('is-window-focused', 0)

/** Tell the main process to focus on the main window. */
export const focusWindow = sendProxy('focus-window', 0)

const _showItemInFolder = invokeProxy('show-item-in-folder', 1)

export const showItemInFolder = (path: string) =>
  pathExists(path)
    .then(() => _showItemInFolder(path))
    .catch(err => log.error(`Unable show item in folder '${path}'`, err))

const UNSAFE_openDirectory = sendProxy('unsafe-open-directory', 1)

export async function showFolderContents(path: string) {
  const stats = await stat(path).catch(err => {
    log.error(`Unable to retrieve file information for ${path}`, err)
    return null
  })

  if (!stats) {
    return
  }

  if (!stats.isDirectory()) {
    log.error(`Trying to get the folder contents of a non-folder at '${path}'`)
    await _showItemInFolder(path)
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

    await _showItemInFolder(path)
  } else {
    UNSAFE_openDirectory(path)
  }
}

export const openExternal = invokeProxy('open-external', 1)
export const moveItemToTrash = invokeProxy('move-to-trash', 1)

/** Tell the main process to obtain the current window state */
export const getCurrentWindowState = invokeProxy('get-current-window-state', 0)

/** Tell the main process to obtain the current window's zoom factor */
export const getCurrentWindowZoomFactor = invokeProxy(
  'get-current-window-zoom-factor',
  0
)

/** Tell the main process that a modal dialog has opened */
export const sendDialogDidOpen = sendProxy('dialog-did-open', 0)

/** Tell the main process to set the current window's zoom factor */
export const setWindowZoomFactor = sendProxy('set-window-zoom-factor', 1)

/** Tell the main process to check for app updates */
export const checkForUpdates = invokeProxy('check-for-updates', 1)

/** Tell the main process to quit the app and install updates */
export const quitAndInstallUpdate = sendProxy('quit-and-install-updates', 0)

/** Tell the main process to quit the app */
export const quitApp = sendProxy('quit-app', 0)

/** Subscribes to auto updater error events originating from the main process */
export function onAutoUpdaterError(
  errorHandler: (evt: Electron.IpcRendererEvent, error: Error) => void
) {
  ipcRenderer.on('auto-updater-error', errorHandler)
}

/** Subscribes to auto updater checking for update events originating from the
 * main process */
export function onAutoUpdaterCheckingForUpdate(eventHandler: () => void) {
  ipcRenderer.on('auto-updater-checking-for-update', eventHandler)
}

/** Subscribes to auto updater update available events originating from the
 * main process */
export function onAutoUpdaterUpdateAvailable(eventHandler: () => void) {
  ipcRenderer.on('auto-updater-update-available', eventHandler)
}

/** Subscribes to auto updater update not available events originating from the
 * main process */
export function onAutoUpdaterUpdateNotAvailable(eventHandler: () => void) {
  ipcRenderer.on('auto-updater-update-not-available', eventHandler)
}

/** Subscribes to auto updater update downloaded events originating from the
 * main process */
export function onAutoUpdaterUpdateDownloaded(eventHandler: () => void) {
  ipcRenderer.on('auto-updater-update-downloaded', eventHandler)
}

/** Subscribes to the native theme updated event originating from the main process */
export function onNativeThemeUpdated(eventHandler: () => void) {
  ipcRenderer.on('native-theme-updated', eventHandler)
}

/** Subscribes to the "show installing update dialog" event originating from the
 * main process */
export function onShowInstallingUpdate(eventHandler: () => void) {
  ipcRenderer.on('show-installing-update', eventHandler)
}

/** Tell the main process to set the native theme source */
export const setNativeThemeSource = sendProxy('set-native-theme-source', 1)

/** Tell the main process to obtain wether the native theme uses dark colors */
export const shouldUseDarkColors = invokeProxy('should-use-dark-colors', 0)

/** Tell the main process to minimize the window */
export const minimizeWindow = sendProxy('minimize-window', 0)

/** Tell the main process to maximize the window */
export const maximizeWindow = sendProxy('maximize-window', 0)

/** Tell the main process to unmaximize the window */
export const restoreWindow = sendProxy('unmaximize-window', 0)

/** Tell the main process to close the window */
export const closeWindow = sendProxy('close-window', 0)

/** Tell the main process to get whether the window is maximized */
export const isWindowMaximized = invokeProxy('is-window-maximized', 0)

/** Tell the main process to get the users system preference for app action on
 * double click */
export const getAppleActionOnDoubleClick = invokeProxy(
  'get-apple-action-on-double-click',
  0
)

/**
 * Show the OS-provided certificate trust dialog for the certificate, using the
 * given message.
 */
export const showCertificateTrustDialog = sendProxy(
  'show-certificate-trust-dialog',
  2
)

/**
 * Tell the main process to obtain the applications path for given path type
 */
export const getPath = invokeProxy('get-path', 1)

/**
 * Tell the main process to obtain the applications architecture
 */
export const getAppArchitecture = invokeProxy('get-app-architecture', 0)

/**
 * Tell the main process to obtain the application's app path
 */
export const getAppPathProxy = invokeProxy('get-app-path', 0)

/**
 * Tell the main process to obtain whether the app is running under a rosetta
 * translation
 */
export const isRunningUnderARM64Translation = invokeProxy(
  'is-running-under-arm64-translation',
  0
)

/**
 * Tell the main process that we're going to quit. This means it should allow
 * the window to close.
 *
 * This event is sent synchronously to avoid any races with subsequent calls
 * that would tell the app to quit.
 */
export function sendWillQuitSync() {
  // eslint-disable-next-line no-sync
  ipcRenderer.sendSync('will-quit')
}

/**
 * Tell the main process that we're going to quit, even if the app is installing
 * an update. This means it should allow the window to close.
 *
 * This event is sent synchronously to avoid any races with subsequent calls
 * that would tell the app to quit.
 */
export function sendWillQuitEvenIfUpdatingSync() {
  // eslint-disable-next-line no-sync
  ipcRenderer.sendSync('will-quit-even-if-updating')
}

/**
 * Tell the main process that the user cancelled quitting.
 *
 * This event is sent synchronously to avoid any races with subsequent calls
 * that would tell the app to quit.
 */
export function sendCancelQuittingSync() {
  // eslint-disable-next-line no-sync
  ipcRenderer.sendSync('cancel-quitting')
}

/**
 * Tell the main process to move the application to the application folder
 */
export const moveToApplicationsFolder = invokeProxy(
  'move-to-applications-folder',
  0
)

/**
 * Ask the main-process to send over a copy of the application menu.
 * The response will be send as a separate event with the name 'app-menu' and
 * will be received by the dispatcher.
 */
export const getAppMenu = sendProxy('get-app-menu', 0)

export const invokeContextualMenu = invokeProxy('show-contextual-menu', 2)

/** Update the menu item labels with the user's preferred apps. */
export const updatePreferredAppMenuItemLabels = sendProxy(
  'update-preferred-app-menu-item-labels',
  1
)

function getIpcFriendlyError(error: Error) {
  return {
    message: error.message || `${error}`,
    name: error.name || `${error.name}`,
    stack: error.stack || undefined,
  }
}

export const _reportUncaughtException = sendProxy('uncaught-exception', 1)

export function reportUncaughtException(error: Error) {
  _reportUncaughtException(getIpcFriendlyError(error))
}

const _sendErrorReport = sendProxy('send-error-report', 3)

export function sendErrorReport(
  error: Error,
  extra: Record<string, string>,
  nonFatal: boolean
) {
  _sendErrorReport(getIpcFriendlyError(error), extra, nonFatal)
}

export const updateAccounts = sendProxy('update-accounts', 1)

/** Tells the main process to resolve the proxy for a given url */
export const resolveProxy = invokeProxy('resolve-proxy', 1)

/**
 * Tell the main process to obtain whether the Desktop application is in the
 * application folder
 *
 * Note: will return null when not running on darwin
 */
export const isInApplicationFolder = invokeProxy('is-in-application-folder', 0)

/**
 * Tell the main process to show save dialog
 */
export const showSaveDialog = invokeProxy('show-save-dialog', 1)

/**
 * Tell the main process to show open dialog
 */
export const showOpenDialog = invokeProxy('show-open-dialog', 1)

/** Tell the main process read/save the user GUID from/to file */
export const saveGUID = invokeProxy('save-guid', 1)
export const getGUID = invokeProxy('get-guid', 0)

/** Tell the main process to show a notification */
export const showNotification = invokeProxy('show-notification', 3)

/** Tell the main process to obtain the app's permission to display notifications */
export const getNotificationsPermission = invokeProxy(
  'get-notifications-permission',
  0
)

/** Tell the main process to request the app's permission to display notifications */
export const requestNotificationsPermission = invokeProxy(
  'request-notifications-permission',
  0
)

/** Tell the main process to (un)install the CLI on Windows */
export const installWindowsCLI = sendProxy('install-windows-cli', 0)
export const uninstallWindowsCLI = sendProxy('uninstall-windows-cli', 0)
