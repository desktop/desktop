/* eslint-disable no-sync */

import { IAppShell } from '../../src/lib/app-shell'

import * as Fs from 'fs'

export const shell: IAppShell = {
  moveItemToTrash: (path: string): boolean => {
    Fs.unlinkSync(path)
    return true
  },
  beep: () => {},
  showItemInFolder: (path: string) => {},
  showFolderContents: (path: string) => {},
  openExternal: (path: string) => {
    return Promise.resolve(true)
  },
  openPath: (path: string) => Promise.resolve(''),
}
