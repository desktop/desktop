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

  public exec(): void {
    exec(this.cmd + ' ' + this.path , (error: Error, stdout: string, stderr: string) =>{
      console.log('err: ' + error)
      console.log('stdout: ' + stdout)
      console.log('stderr: ' + stderr)
    })

  }
}
function getEditorList(repository: Repository, path: string ): Promise<IEditorLauncher[]> {
  const result = new Array<IEditorLauncher>()
  //
  // localStorage.setItem('external-editors-', '[{"name":"Visual Studio", "cmd":"\\"C:\\\\Program Files (x86)\\\\Microsoft Visual Studio\\\\2017\\\\Community\\\\Common7\\\\IDE\\\\devenv.exe\\" %1"}]')
  //
  const ext = Path.extname(path)
  const raw = localStorage.getItem('external-editors-' + ext)
  if (raw && raw.length) {
    const editorInfo: ReadonlyArray<IEditorInfo> = JSON.parse(raw)
    for (let i = 0; i < editorInfo.length; i++) {
      result.push( new AppLauncher( editorInfo[i].name, editorInfo[i].cmd, repository.path ) )
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
