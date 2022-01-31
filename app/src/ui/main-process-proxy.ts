import * as remote from '@electron/remote'
import { ExecutableMenuItem } from '../models/app-menu'
import { IMenuItem, ISerializableMenuItem } from '../lib/menu-item'
import { RequestResponseChannels, RequestChannels } from '../lib/ipc-shared'
import * as ipcRenderer from '../lib/ipc-renderer'

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

export const showItemInFolder = sendProxy('show-item-in-folder', 1)
export const showFolderContents = sendProxy('show-folder-contents', 1)
export const openExternal = invokeProxy('open-external', 1)
export const moveItemToTrash = invokeProxy('move-to-trash', 1)

/** Tell the main process to obtain the current window state */
export const getCurrentWindowState = invokeProxy('get-current-window-state', 0)

/** Tell the main process to obtain the current window's zoom factor */
export const getCurrentWindowZoomFactor = invokeProxy(
  'get-current-window-zoom-factor',
  0
)

/** Tell the main process to check for app updates */
export const checkForUpdates = invokeProxy('check-for-updates', 1)

/** Tell the main process to quit the app and install updates */
export const quitAndInstallUpdate = sendProxy('quit-and-install-updates', 0)

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
 * Tell the main process to obtain the applications architecture
 */
export const getAppArchitecture = invokeProxy('get-app-architecture', 0)

/**
 * Tell the main process to obtain whether the app is running under a rosetta
 * translation
 */
export const isRunningUnderRosettaTranslation = invokeProxy(
  'is-running-under-rosetta-translation',
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
 * Tell the main process to move the application to the application folder
 */
export const moveToApplicationsFolder = sendProxy(
  'move-to-applications-folder',
  0
)

/**
 * Ask the main-process to send over a copy of the application menu.
 * The response will be send as a separate event with the name 'app-menu' and
 * will be received by the dispatcher.
 */
export const getAppMenu = sendProxy('get-app-menu', 0)

function findSubmenuItem(
  currentContextualMenuItems: ReadonlyArray<IMenuItem>,
  indices: ReadonlyArray<number>
): IMenuItem | undefined {
  let foundMenuItem: IMenuItem | undefined = {
    submenu: currentContextualMenuItems,
  }

  // Traverse the submenus of the context menu until we find the appropriate index.
  for (const index of indices) {
    if (foundMenuItem === undefined || foundMenuItem.submenu === undefined) {
      return undefined
    }

    foundMenuItem = foundMenuItem.submenu[index]
  }

  return foundMenuItem
}

let deferredContextMenuItems: ReadonlyArray<IMenuItem> | null = null

/** Takes a context menu and spelling suggestions from electron and merges them
 * into one context menu. */
function mergeDeferredContextMenuItems(
  event: Electron.Event,
  params: Electron.ContextMenuParams
) {
  if (deferredContextMenuItems === null) {
    return
  }

  const items = [...deferredContextMenuItems]
  const { misspelledWord, dictionarySuggestions } = params

  if (!misspelledWord && dictionarySuggestions.length === 0) {
    showContextualMenu(items, false)
    return
  }

  items.push({ type: 'separator' })

  const { webContents } = remote.getCurrentWindow()

  for (const suggestion of dictionarySuggestions) {
    items.push({
      label: suggestion,
      action: () => webContents.replaceMisspelling(suggestion),
    })
  }

  if (misspelledWord) {
    items.push({
      label: __DARWIN__ ? 'Add to Dictionary' : 'Add to dictionary',
      action: () =>
        webContents.session.addWordToSpellCheckerDictionary(misspelledWord),
    })
  }

  if (!__DARWIN__) {
    // NOTE: "On macOS as we use the native APIs there is no way to set the
    // language that the spellchecker uses" -- electron docs Therefore, we are
    // only allowing setting to English for non-mac machines.
    const spellCheckLanguageItem = getSpellCheckLanguageMenuItem(
      webContents.session
    )
    if (spellCheckLanguageItem !== null) {
      items.push(spellCheckLanguageItem)
    }
  }

  showContextualMenu(items, false)
}

/**
 * Method to get a menu item to give user the option to use English or their
 * system language.
 *
 * If system language is english, it returns null. If spellchecker is not set to
 * english, it returns item that can set it to English. If spellchecker is set
 * to english, it returns the item that can set it to their system language.
 */
function getSpellCheckLanguageMenuItem(
  session: Electron.session
): IMenuItem | null {
  const userLanguageCode = remote.app.getLocale()
  const englishLanguageCode = 'en-US'
  const spellcheckLanguageCodes = session.getSpellCheckerLanguages()

  if (
    userLanguageCode === englishLanguageCode &&
    spellcheckLanguageCodes.includes(englishLanguageCode)
  ) {
    return null
  }

  const languageCode =
    spellcheckLanguageCodes.includes(englishLanguageCode) &&
    !spellcheckLanguageCodes.includes(userLanguageCode)
      ? userLanguageCode
      : englishLanguageCode

  const label =
    languageCode === englishLanguageCode
      ? 'Set spellcheck to English'
      : 'Set spellcheck to system language'

  return {
    label,
    action: () => session.setSpellCheckerLanguages([languageCode]),
  }
}

const _showContextualMenu = invokeProxy('show-contextual-menu', 1)

/** Show the given menu items in a contextual menu. */
export async function showContextualMenu(
  items: ReadonlyArray<IMenuItem>,
  mergeWithSpellcheckSuggestions = false
) {
  /*
    When a user right clicks on a misspelled word in an input, we get event from
    electron. That event comes after the context menu event that we get from the
    dom. In order merge the spelling suggestions from electron with the context
    menu that the input wants to show, we stash the context menu items from the
    input away while we wait for the event from electron.
  */
  if (deferredContextMenuItems !== null) {
    deferredContextMenuItems = null
    remote
      .getCurrentWebContents()
      .off('context-menu', mergeDeferredContextMenuItems)
  }

  if (mergeWithSpellcheckSuggestions) {
    deferredContextMenuItems = items
    remote
      .getCurrentWebContents()
      .once('context-menu', mergeDeferredContextMenuItems)
    return
  }

  /*
  This is a regular context menu that does not need to merge with spellcheck
  items. They can be shown right away.
  */
  const indices = await _showContextualMenu(serializeMenuItems(items))

  if (indices !== null) {
    const menuItem = findSubmenuItem(items, indices)

    if (menuItem !== undefined && menuItem.action !== undefined) {
      menuItem.action()
    }
  }
}

/**
 * Remove the menu items properties that can't be serializable in
 * order to pass them via IPC.
 */
function serializeMenuItems(
  items: ReadonlyArray<IMenuItem>
): ReadonlyArray<ISerializableMenuItem> {
  return items.map(item => ({
    ...item,
    action: undefined,
    submenu: item.submenu ? serializeMenuItems(item.submenu) : undefined,
  }))
}

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
