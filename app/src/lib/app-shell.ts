import { shell as electronShell, ipcRenderer } from 'electron'
import * as Path from 'path'

import { Repository } from '../models/repository'

export interface IAppShell {
  readonly moveItemToTrash: (path: string) => boolean
  readonly beep: () => void
  readonly openExternal: (path: string) => Promise<boolean>
  readonly openItem: (path: string) => boolean
  readonly showItemInFolder: (path: string) => void
}

export const shell: IAppShell = {
  moveItemToTrash: electronShell.moveItemToTrash,
  beep: electronShell.beep,
  openExternal: path => {
    return new Promise<boolean>((resolve, reject) => {
      ipcRenderer.once(
        'open-external-result',
        (event: Electron.IpcMessageEvent, { result }: { result: boolean }) => {
          resolve(result)
        }
      )

      ipcRenderer.send('open-external', { path })
    })
  },
  showItemInFolder: path => {
    ipcRenderer.send('show-item-in-folder', { path })
  },
  openItem: electronShell.openItem,
}

/**
 * Reveals a file from a repository in the native file manager.
 *
 * @param repository The currently active repository instance
 * @param path The path of the file relative to the root of the repository
 */
export function revealInFileManager(repository: Repository, path: string) {
  const fullyQualifiedFilePath = Path.join(repository.path, path)
  return shell.showItemInFolder(fullyQualifiedFilePath)
}
