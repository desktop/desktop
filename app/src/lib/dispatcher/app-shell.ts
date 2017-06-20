import { shell as electronShell } from 'electron'
import { Repository } from '../../models/repository'

export interface IEditorInfo {
  readonly name: string
  readonly exec: () => void
}

interface IEditorBuilder {
  readonly getEditorsForRepository: (repo: Repository) => Promise<IEditorInfo>
}

export interface IAppShell {
  readonly moveItemToTrash: (path: string) => boolean
  readonly beep: () => void
  readonly openExternal: (path: string) => void
  readonly openItem: (path: string) => boolean
  readonly getEditors: (repository: Repository, path: string) => Promise<IEditorInfo[]>
}

function getEditorList(repository: Repository, path: string ): Promise<IEditorInfo[]> {
  const result = new Array<IEditorInfo>()

  result.push({
    name: 'External Editor',
    exec: () => {
    },
  })

  if (__DARWIN__) {
    // FIXME: this doesn't exist yet and is intended to break
    /*
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
    */
    return Promise.resolve(result)
  } else {
    const win32: IEditorBuilder = require('./shell-win32')
    return win32
    .getEditorsForRepository(repository)
    .then( (res) => {
      result.push.apply(result, res )
      return result
    })
  }
}

export const shell: IAppShell = {
  moveItemToTrash: electronShell.moveItemToTrash,
  beep: electronShell.beep,
  openExternal: electronShell.openExternal,
  openItem: electronShell.openItem,
  getEditors: getEditorList,
}
