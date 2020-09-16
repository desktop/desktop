import { shell as electronShell, ipcRenderer } from 'electron'
import * as Path from 'path'

import { Repository } from '../models/repository'

export interface IAppShell {
  readonly moveItemToTrash: (path: string) => boolean
  readonly beep: () => void
  readonly openExternal: (path: string) => Promise<boolean>
  /**
   * Reveals the specified file using the operating
   * system default application.
   * Do not use this method with non-validated paths.
   *
   * @param path - The path of the file to open
   */

  readonly openPath: (path: string) => Promise<string>
  /**
   * Reveals the specified file on the operating system
   * default file explorer. If a folder is passed, it will
   * open its parent folder and preselect the passed folder.
   *
   * @param path - The path of the file to show
   */
  readonly showItemInFolder: (path: string) => void
  /**
   * Reveals the specified folder on the operating
   * system default file explorer.
   * Do not use this method with non-validated paths.
   *
   * @param path - The path of the folder to open
   */
  readonly showFolderContents: (path: string) => void
}

export const shell: IAppShell = {
  moveItemToTrash: electronShell.moveItemToTrash,
  beep: electronShell.beep,
  openExternal: path => {
    return new Promise<boolean>((resolve, reject) => {
      ipcRenderer.once(
        'open-external-result',
        (event: Electron.IpcRendererEvent, { result }: { result: boolean }) => {
          resolve(result)
        }
      )

      ipcRenderer.send('open-external', { path })
    })
  },
  showItemInFolder: path => {
    ipcRenderer.send('show-item-in-folder', { path })
  },
  showFolderContents: path => {
    ipcRenderer.send('show-folder-contents', { path })
  },
  openPath: electronShell.openPath,
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
