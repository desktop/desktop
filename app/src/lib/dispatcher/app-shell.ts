import { shell as electronShell } from 'electron'

export interface IAppShell {
  readonly moveItemToTrash: (path: string) => boolean
  readonly beep: () => void
  readonly openExternal: (url: string, options?: { activate: boolean}) => void
  readonly openItem: (path: string) => boolean
}

export const shell: IAppShell = {
  moveItemToTrash: electronShell.moveItemToTrash,
  beep: electronShell.beep,
  openExternal: electronShell.openExternal,
  openItem: electronShell.openItem,
}
