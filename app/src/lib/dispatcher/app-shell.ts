import { shell as electronShell } from 'electron'
import { Repository } from '../../models/repository'
import { exec } from 'child_process'
import * as Path from 'path'

export interface IEditorInfo {
  readonly name: string
  readonly cmd: string
}

export interface IEditorLauncher {
  readonly name: string
  readonly exec: () => void
}

export interface IAppShell {
  readonly moveItemToTrash: (path: string) => boolean
  readonly beep: () => void
  readonly openExternal: (path: string) => void
  readonly openItem: (path: string) => boolean
  readonly getEditors: (repository: Repository, path: string) => Promise<IEditorLauncher[]>
}

class AppLauncher implements IEditorLauncher {
  public readonly name: string
  private readonly cmd: string
  private readonly path: string

  public constructor(name: string, cmd: string, path: string) {
    this.name = name
    this.cmd  = cmd
    this.path = path
  }

  public exec(): Promise<void> {
    const cmd = this.cmd.replace('{path}', this.path)
    return new Promise<void>( (resolve, reject) => {
      exec(cmd , (err, stdout: string, stderr: string) => {
        // Log what just ran
        console.log(cmd)
        console.log('stdout:' + stdout)
        console.log('stderr:' + stderr)
        if (err) {
          console.log(err)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }
}
function getEditorList(repository: Repository, path: string ): Promise<IEditorLauncher[]> {
  const result = new Array<IEditorLauncher>()
  //
  // localStorage.setItem('external-editors-', '[{"name":"Visual Studio", "cmd":"\\"C:\\\\Program Files (x86)\\\\Microsoft Visual Studio\\\\2017\\\\Community\\\\Common7\\\\IDE\\\\devenv.exe\\" \\"{path}\\""}]')
  //
  const ext = Path.extname(path)
  if (localStorage.getItem('external-editors-') === null) {
    const editorInfo = Array<IEditorInfo>()
    if (__DARWIN__) {
      editorInfo.push( {
        name: 'Atom',
        cmd: '"/Applications/Atom.app/Contents/MacOS/Atom\" \"{path}\"',
      })
      editorInfo.push( {
        name: 'VS Code',
        cmd: '"/Applications/Visual Studio Code.app/Contents/MacOS/Electron\" \"{path}\"',
      })
    } else {

      editorInfo.push( {
        name: 'Visual Studio',
        cmd: '\C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Community\\Common7\\IDE\\devenv.exe\" \"{path}\"',
      })

      editorInfo.push( {
        name: 'VS Code',
        cmd: '\"C:\Program Files (x86)\Microsoft VS Code\Code.exe\" \"{path}\"',
      })
    }

    /**
     * Make some default external editors
     */
    localStorage.setItem('external-editors-', JSON.stringify(editorInfo))
    localStorage.setItem('external-editors-c', JSON.stringify(editorInfo))
    localStorage.setItem('external-editors-cpp', JSON.stringify(editorInfo))
    localStorage.setItem('external-editors-txt', JSON.stringify(editorInfo))

  }

  const raw = localStorage.getItem('external-editors-' + ext)
  if (raw) {
    try {
    const editorInfo: ReadonlyArray<IEditorInfo> = JSON.parse(raw)
    for (let i = 0; i < editorInfo.length; i++) {
      result.push( new AppLauncher( editorInfo[i].name, editorInfo[i].cmd, repository.path ) )
    }} catch (e) {
      console.log(e)
    }
  }

  return Promise.resolve(result)
}

export const shell: IAppShell = {
  moveItemToTrash: electronShell.moveItemToTrash,
  beep: electronShell.beep,
  openExternal: electronShell.openExternal,
  openItem: electronShell.openItem,
  getEditors: getEditorList,
}
