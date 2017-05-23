import { ipcRenderer } from 'electron'
import { ExecutableMenuItem } from '../models/app-menu'
import { MenuIDs } from '../main-process/menu'
import { IMenuItemState } from '../lib/menu-update'
import { ILogEntry } from '../lib/logging/main'

/** Set the menu item's enabledness. */
export function updateMenuState(state: Array<{id: MenuIDs, state: IMenuItemState}>) {
  ipcRenderer.send('update-menu-state', state)
}

/** Tell the main process that the renderer is ready. */
export function sendReady(time: number) {
  ipcRenderer.send('renderer-ready', time)
}

/** Tell the main process to execute (i.e. simulate a click of) the menu item. */
export function executeMenuItem(item: ExecutableMenuItem) {
  ipcRenderer.send('execute-menu-item', { id: item.id })
}

/**
 * Show the OS-provided certificate trust dialog for the certificate, using the
 * given message.
 */
export function showCertificateTrustDialog(certificate: Electron.Certificate, message: string) {
  ipcRenderer.send('show-certificate-trust-dialog', { certificate, message })
}

/**
 * Tell the main process that we're going to quit. This means it should allow
 * the window to close.
 *
 * This event is sent synchronously to avoid any races with subsequent calls
 * that would tell the app to quit.
 */
export function sendWillQuitSync() {
  // tslint:disable-next-line:no-sync-functions
  ipcRenderer.sendSync('will-quit')
}

/**
 * Ask the main-process to send over a copy of the application menu.
 * The response will be send as a separate event with the name 'app-menu' and
 * will be received by the dispatcher.
 */
export function getAppMenu() {
  ipcRenderer.send('get-app-menu')
}

export interface IMenuItem {
  /** The user-facing label. */
  readonly label?: string

  /** The action to invoke when the user selects the item. */
  readonly action?: () => void

  /** The type of item. */
  readonly type?: 'separator'

  /** Is the menu item enabled? Defaults to true. */
  readonly enabled?: boolean
}

/**
 * There's currently no way for us to know when a contextual menu is closed (see
 * https://github.com/electron/electron/issues/9441). So we'll store the latest
 * contextual menu items we presented and assume any actions we receive are
 * coming from it.
 */
let currentContextualMenuItems: ReadonlyArray<IMenuItem> | null = null

/**
 * Register a global handler for dispatching contextual menu actions. This
 * should be called only once, around app load time.
 */
export function registerContextualMenuActionDispatcher() {
  ipcRenderer.on('contextual-menu-action', (event: Electron.IpcRendererEvent, index: number) => {
    if (!currentContextualMenuItems) { return }
    if (index >= currentContextualMenuItems.length) { return }

    const item = currentContextualMenuItems[index]
    const action = item.action
    if (action) {
      action()
      currentContextualMenuItems = null
    }
  })
}

/** Show the given menu items in a contextual menu. */
export function showContextualMenu(items: ReadonlyArray<IMenuItem>) {
  currentContextualMenuItems = items
  ipcRenderer.send('show-contextual-menu', items)
}

/**
 * Dispatches the given log entry to the main process where it will be picked
 * written to all log transports. See initializeWinston in logger.ts for more
 * details about what transports we set up.
 */
export function log(entry: ILogEntry) {
  ipcRenderer.send('log', entry)
}
