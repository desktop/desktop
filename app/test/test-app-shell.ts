/* tslint:disable:no-sync-functions */

import { IAppShell } from '../src/lib/dispatcher/app-shell'

import * as Fs from 'fs'

export const shell: IAppShell = {
  moveItemToTrash: (path: string): boolean => {
    Fs.unlinkSync(path)
    return true
  },
  beep: () => { },
  openExternal: (path: string) => { },
  openItem: (path: string) => true,
}
