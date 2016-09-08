import { ipcRenderer } from 'electron'
import { MenuIDs } from '../main-process/menu'

/** Show the app menu as a popup. */
export function showPopupAppMenu() {
  ipcRenderer.send('show-popup-app-menu')
}

/** Set the menu item's enabledness. */
export function setMenuEnabled(id: MenuIDs, enabled: boolean) {
  ipcRenderer.send('set-menu-enabled', [ { id, enabled } ])
}

/** Show the main window. */
export function showMainWindow() {
  ipcRenderer.send('show-main-window')
}

export interface IMenuItem {
  readonly label: string
  readonly action: () => void
}

/** Show the given menu items in a contextual menu. */
export function showContextualMenu(items: ReadonlyArray<IMenuItem>) {
  ipcRenderer.on('contextual-menu-action', (event: Electron.IpcRendererEvent, index: number) => {
    const item = items[index]
    item.action()
  })

  ipcRenderer.send('show-contextual-menu', items)
}
