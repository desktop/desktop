import { ipcRenderer } from 'electron'
import { MenuIDs } from '../main-process/menu'
import { v4 as guid } from 'uuid'
import { IHTTPRequest, IHTTPResponse } from '../lib/http'
import { ExecutableMenuItem } from '../models/app-menu'

/** Set the menu item's enabledness. */
export function setMenuEnabled(id: MenuIDs, enabled: boolean) {
  ipcRenderer.send('set-menu-enabled', { id, enabled })
}

/** Set the menu item's visibility. */
export function setMenuVisible(id: MenuIDs, visible: boolean) {
  ipcRenderer.send('set-menu-visible', { id, visible })
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
 * Ask the main-process to send over a copy of the application menu.
 * The response will be send as a separate event with the name 'app-menu' and
 * will be received by the dispatcher.
 */
export function getAppMenu() {
  ipcRenderer.send('get-app-menu')
}

export interface IMenuItem {
  readonly label: string
  readonly action: () => void
}

/**
 * Delay the contextual menu slightly so that we have time to render any changes
 * in reaction to the click. Otherwise the modal menu loop on the main thread
 * blocks the renderer's run loop before it can redraw. See https://github.com/electron/electron/issues/1854.
 *
 * This amount was determined entirely by experimentation.
 */
const ShowContextualMenuDelay = 30

/** Show the given menu items in a contextual menu. */
export function showContextualMenu(items: ReadonlyArray<IMenuItem>) {
  setTimeout(() => {
    ipcRenderer.once('contextual-menu-action', (event: Electron.IpcRendererEvent, index: number) => {
      const item = items[index]
      item.action()
    })

    ipcRenderer.send('show-contextual-menu', items)
  }, ShowContextualMenuDelay)
}

export function proxyRequest(options: IHTTPRequest): Promise<IHTTPResponse> {
  return new Promise<IHTTPResponse>((resolve, reject) => {
    const id = guid()

    const startTime = (performance && performance.now) ? performance.now() : null

    ipcRenderer.once(`proxy/response/${id}`, (event: any, { error, response }: { error?: Error, response?: IHTTPResponse }) => {

      if (console.debug && startTime) {
        const rawTime = performance.now() - startTime
        if (rawTime > 500) {
          const timeInSeconds = (rawTime / 1000).toFixed(3)
          console.debug(`executing: ${options.url} (took ${timeInSeconds}s)`)
        }
      }

      if (error) {
        reject(error)
        return
      }

      if (response === undefined) {
        reject('no response received, and no error reported. should probably look into this')
        return
      }

      resolve(response)
    })

    ipcRenderer.send('proxy/request', { id, options })
  })
}
