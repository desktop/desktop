/* tslint:disable:no-sync-functions */

import { IAppShell } from '../src/lib/dispatcher/app-shell'
import { Repository } from '../src/models/repository'

import * as Fs from 'fs'

export interface IEditorInfo {
  readonly name: string
  readonly exec: () => void
}

export const shell: IAppShell = {
  moveItemToTrash: (path: string): boolean => {
    Fs.unlinkSync(path)
    return true
  },
  beep: () => { },
  openExternal: (path: string) => { },
  openItem: (path: string) => true,
  getEditors: (repository: Repository, path: string) => { return Promise.resolve( Array<IEditorInfo>())  },
}
