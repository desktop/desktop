import { ipcRenderer } from 'electron'
import { MenuIDs } from '../main-process/menu'
import { v4 as guid } from 'node-uuid'


/** Show the app menu as a popup. */
export function showPopupAppMenu() {
  ipcRenderer.send('show-popup-app-menu')
}

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

export interface IMenuItem {
  readonly label: string
  readonly action: () => void
}

/** Show the given menu items in a contextual menu. */
export function showContextualMenu(items: ReadonlyArray<IMenuItem>) {
  ipcRenderer.once('contextual-menu-action', (event: Electron.IpcRendererEvent, index: number) => {
    const item = items[index]
    item.action()
  })

  ipcRenderer.send('show-contextual-menu', items)
}

export function proxyRequest(options: Electron.RequestOptions, body: string | Buffer | undefined): Promise<Electron.IncomingMessage> {

  return new Promise<Electron.IncomingMessage>((resolve, reject) => {

    console.debug(`[request] ${options.url}`)

    const id = guid()

    ipcRenderer.once(`proxy/response/${id}`, (event: any, {statusCode, headers, body }: { statusCode: string, headers: any, body: string | undefined }) => {

      console.debug(`[response] ${options.url}`)

      // TODO: is there any more plumbing to insert here?

      debugger

      console.log(`STATUS: ${statusCode}`)
      console.log(`HEADERS: ${JSON.stringify(headers)}`)
      console.log(`BODY: '${body}'`)
    })

    ipcRenderer.send('proxy/request', { id, options, body })
  })
}
