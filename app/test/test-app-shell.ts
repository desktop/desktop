/* tslint:disable:no-sync-functions */

import {
  IAppShell,
  IEditorInfo,
  IEditorLauncher,
} from '../src/lib/dispatcher/app-shell'

import * as Fs from 'fs'

export const shell: IAppShell = {
  moveItemToTrash: (path: string): boolean => {
    Fs.unlinkSync(path)
    return true
  },
  beep: () => {},
  showItemInFolder: (path: string) => {},
  openExternal: (path: string) => {
    return Promise.resolve(true)
  },
  openItem: (path: string) => true,
  getEditors: (path: string) => {
    return Promise.resolve(Array<IEditorLauncher>())
  },
  setEditors: (ext: string, info: IEditorInfo[]) => {},
  removeEditors: (ext: string) => {},
  getAllEditors: () => {
    return new Map<string, ReadonlyArray<IEditorInfo>>()
  },
}
