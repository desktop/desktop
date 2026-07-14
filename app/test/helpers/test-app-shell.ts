/* eslint-disable no-sync */

import { IAppShell } from '../../src/lib/app-shell'
import { promisify } from 'util'

import * as Fs from 'fs'

const unlink = promisify(Fs.unlink)

export const shell: IAppShell = {
  moveItemToTrash: (path: string): Promise<void> => {
    return unlink(path)
  },
  beep: () => {},
  showItemInFolder: (path: string) => {},
  showFolderContents: (path: string) => {},
  openExternal: (path: string) => {
    return Promise.resolve(true)
  },
  openPath: (path: string) => Promise.resolve(''),
}
