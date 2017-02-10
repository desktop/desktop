import { shell as electronShell } from 'electron'

export interface IAppShell {
  moveItemToTrash: (path: string) => boolean
}

export const shell: IAppShell = {
  moveItemToTrash: (path: string) => electronShell.moveItemToTrash(path),
}
