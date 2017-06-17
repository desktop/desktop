import { shell as electronShell } from 'electron'

export interface IEditorInfo {
  readonly name: string
}

export interface IAppShell {
  readonly moveItemToTrash: (path: string) => boolean
  readonly beep: () => void
  readonly openExternal: (path: string) => void
  readonly openItem: (path: string) => boolean
  readonly getEditors: (path: string) => IEditorInfo[]
}

function getEditorList(path: string ): IEditorInfo[] {
  const result = new Array<IEditorInfo>()
  result.push({
    name: 'External Editor',
  })
  if (__DARWIN__) {
    // FIXME: this doesn't exist yet and is intended to break
    const osx = require('shell-osx')
    if (osx.isAtomInstalled()) {
      result.push({
        name: 'Atom',
      })
    }
  } else {
    const win32 = require('./shell-win32')
    if (win32.isVisualStudioInstalled() ) {
      result.push({
        name: 'Visual Studio',
      })
    }
    if (win32.isVisualStudioCodeInstalled() ) {
      result.push({
        name: 'Visual Studio Code',
      })
    }

    if (win32.isAtomInstalled() ) {
      result.push({
        name: 'Atom',
      })
    }
  }
  return result
}


export const shell: IAppShell = {
  moveItemToTrash: electronShell.moveItemToTrash,
  beep: electronShell.beep,
  openExternal: electronShell.openExternal,
  openItem: electronShell.openItem,
  getEditors: getEditorList,
}
