import { shell as electronShell } from 'electron'
import { Repository } from '../../models/repository'

export interface IEditorInfo {
  readonly name: string
  readonly launch: (repository: Repository, path: string) => void
}

export interface IAppShell {
  readonly moveItemToTrash: (path: string) => boolean
  readonly beep: () => void
  readonly openExternal: (path: string) => void
  readonly openItem: (path: string) => boolean
  readonly getEditors: (repository: Repository, path: string) => IEditorInfo[]
}

function getEditorList(repository: Repository, path: string ): IEditorInfo[] {
  const result = new Array<IEditorInfo>()

  result.push({
    name: 'External Editor',
    launch: (repository: Repository, path: string) => {},
  })
  if (__DARWIN__) {
    // FIXME: this doesn't exist yet and is intended to break
    const osx = require('./shell-osx')
    if (osx.isAtomInstalled()) {
      result.push({
        name: 'Atom',
        launch: (repository: Repository, path: string) => {},
      })
    }
    if (osx.isVisualStudioCodeInstalled() ) {
      result.push({
        name: 'Visual Studio Code',
        launch: (repository: Repository, path: string) => {},
      })
    }
  } else {
    const win32 = require('./shell-win32')
    win32.getEditorsForRepository(repository)

    if (win32.isVisualStudioInstalled() ) {
      result.push({
        name: 'Visual Studio',
        launch: (repository: Repository, path: string) => {},
      })
    }
    if (win32.isVisualStudioCodeInstalled() ) {
      result.push({
        name: 'Visual Studio Code',
        launch: (repository: Repository, path: string) => {},
      })
    }

    if (win32.isAtomInstalled() ) {
      result.push({
        name: 'Atom',
        launch: (repository: Repository, path: string) => {},
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
