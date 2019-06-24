import { ipcRenderer } from 'electron'
import { ExecutableMenuItem } from '../models/app-menu'
import { MenuIDs } from '../models/menu-ids'
import { IMenuItemState } from '../lib/menu-update'
import { IMenuItem } from '../lib/menu-item'
import { MenuLabelsEvent } from '../models/menu-labels'

/** Set the menu item's enabledness. */
export function updateMenuState(
  state: Array<{ id: MenuIDs; state: IMenuItemState }>
) {
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

/** Tell the main process to execute (i.e. simulate a click of) the menu item. */
export function executeMenuItemById(id: MenuIDs) {
  ipcRenderer.send('execute-menu-item', { id })
}

/**
 * Show the OS-provided certificate trust dialog for the certificate, using the
 * given message.
 */
export function showCertificateTrustDialog(
  certificate: Electron.Certificate,
  message: string
) {
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
  // eslint-disable-next-line no-sync
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
  ipcRenderer.on(
    'contextual-menu-action',
    (event: Electron.IpcMessageEvent, index: number) => {
      if (!currentContextualMenuItems) {
        return
      }
      if (index >= currentContextualMenuItems.length) {
        return
      }

      const item = currentContextualMenuItems[index]
      const action = item.action
      if (action) {
        action()
        currentContextualMenuItems = null
      }
    }
  )
}

/** Show the given menu items in a contextual menu. */
export function showContextualMenu(items: ReadonlyArray<IMenuItem>) {
  currentContextualMenuItems = items
  ipcRenderer.send('show-contextual-menu', items)
}

/** Update the menu item labels with the user's preferred apps. */
export function updatePreferredAppMenuItemLabels(labels: MenuLabelsEvent) {
  ipcRenderer.send('update-preferred-app-menu-item-labels', labels)
}

function getIpcFriendlyError(error: Error) {
  return {
    message: error.message || `${error}`,
    name: error.name || `${error.name}`,
    stack: error.stack || undefined,
  }
}

export function reportUncaughtException(error: Error) {
  ipcRenderer.send('uncaught-exception', getIpcFriendlyError(error))
}

export function sendErrorReport(
  error: Error,
  extra: { [key: string]: string } = {}
) {
  ipcRenderer.send('send-error-report', {
    error: getIpcFriendlyError(error),
    extra,
  })
}
