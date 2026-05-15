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
  openUrl: (url: string) => {
    return Promise.resolve(true)
  },
  openFile: (path: string) => {
    return Promise.resolve(true)
  },
  openFolder: (path: string) => {
    return Promise.resolve()
  },
  openPath: (path: string) => Promise.resolve(''),
}
