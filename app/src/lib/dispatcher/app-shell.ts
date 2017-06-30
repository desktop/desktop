import { shell as electronShell, ipcRenderer } from 'electron'

export interface IAppShell {
  readonly moveItemToTrash: (path: string) => boolean
  readonly beep: () => void
  readonly openExternal: (path: string) => void
  readonly openItem: (path: string) => boolean
  readonly showItemInFolder: (path: string) => void
}

export const shell: IAppShell = {
  moveItemToTrash: electronShell.moveItemToTrash,
  beep: electronShell.beep,
  openExternal: electronShell.openExternal,
  showItemInFolder: path => {
    ipcRenderer.send('show-item-in-folder', { path })
  },
  openItem: electronShell.openItem,
}
