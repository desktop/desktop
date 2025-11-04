import { shell as electronShell } from 'electron'
import * as Path from 'path'

import { Repository } from '../models/repository'
import {
  showItemInFolder,
  openFolder,
  openFile,
  openUrl,
  moveItemToTrash,
} from '../ui/main-process-proxy'

export interface IAppShell {
  readonly moveItemToTrash: (path: string) => Promise<void>
  readonly beep: () => void

  /**
   * Opens a URL in the default browser.
   *
   * @param url - The URL to open (http:// or https://)
   */
  readonly openUrl: (url: string) => Promise<boolean>

  /**
   * Opens a file with its default application.
   *
   * @param path - The path of the file to open
   */
  readonly openFile: (path: string) => Promise<boolean>

  /**
   * Opens a folder in the system file explorer.
   * Do not use this method with non-validated paths.
   *
   * @param path - The path of the folder to open
   */
  readonly openFolder: (path: string) => Promise<void>

  /**
   * Reveals the specified file or folder in the system file explorer.
   * This shows the item's parent folder with the item selected.
   *
   * @param path - The path of the file or folder to show
   */
  readonly showItemInFolder: (path: string) => void

  /**
   * Legacy Electron API - opens a path (file or folder).
   * Prefer using openFile or openFolder for clarity.
   */
  readonly openPath: (path: string) => Promise<string>
}

export const shell: IAppShell = {
  // Since Electron 13, shell.trashItem doesn't work from the renderer process
  // on Windows. Therefore, we must invoke it from the main process. See
  // https://github.com/electron/electron/issues/29598
  moveItemToTrash,
  beep: electronShell.beep,
  openUrl,
  openFile,
  openFolder,
  showItemInFolder,
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
