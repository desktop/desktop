import { shell as electronShell, ipcRenderer } from 'electron'
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
  readonly openExternal: (path: string) => Promise<boolean>
  readonly openItem: (path: string) => boolean
  readonly showItemInFolder: (path: string) => void
  readonly getEditors: (path: string) => Promise<IEditorLauncher[]>
  readonly setEditors: (ext: string, info: IEditorInfo[]) => void
  readonly getAllEditors: () => Map<string, ReadonlyArray<IEditorInfo>>
  readonly removeEditors: (ext: string) => void
}

class AppLauncher implements IEditorLauncher {
  public readonly name: string
  private readonly cmd: string
  private readonly path: string

  public constructor(name: string, cmd: string, path: string) {
    this.name = name
    this.cmd = cmd
    this.path = path
  }

  public exec(): Promise<void> {
    const cmd = this.cmd.replace('{path}', this.path)
    return new Promise<void>((resolve, reject) => {
      console.log('Executing ' + cmd)
      exec(cmd, (err, stdout: string, stderr: string) => {
        // Log any errors
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

function parseLaunchers(raw: string): ReadonlyArray<IEditorInfo> {
  if (raw) {
    try {
      const editorInfo: ReadonlyArray<IEditorInfo> = JSON.parse(raw)
      return editorInfo
    } catch (e) {
    }
  }

  return new Array<IEditorInfo>()
}


function getAllEditors(): Map<string, ReadonlyArray<IEditorInfo>> {
  const result = new Map<string, ReadonlyArray<IEditorInfo>>()

  if (localStorage.getItem('external-editors-') === null) {
    const editorInfo = Array<IEditorInfo>()
    if (__DARWIN__) {
      editorInfo.push({
        name: 'Atom',
        cmd: '"/Applications/Atom.app/Contents/MacOS/Atom\" \"{path}\"',
      })
      editorInfo.push({
        name: 'VS Code',
        cmd: '"/Applications/Visual Studio Code.app/Contents/MacOS/Electron\" \"{path}\"',
      })
    } else {

      editorInfo.push({
        name: 'Visual Studio',
        cmd: '\C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Community\\Common7\\IDE\\devenv.exe\" \"{path}\"',
      })

      editorInfo.push({
        name: 'VS Code',
        cmd: '\"C:\Program Files (x86)\Microsoft VS Code\Code.exe\" \"{path}\"',
      })
    }

    /**
     * Make some default external editors
     */
    localStorage.setItem('external-editors-', JSON.stringify(editorInfo))
    localStorage.setItem('external-editors-.c', JSON.stringify(editorInfo))
    localStorage.setItem('external-editors-.cpp', JSON.stringify(editorInfo))
    localStorage.setItem('external-editors-.txt', JSON.stringify(editorInfo))
    localStorage.setItem('external-editors-.json', JSON.stringify(editorInfo))
    localStorage.setItem('external-editors-.js', JSON.stringify(editorInfo))

  }

  for (const o in localStorage) {
    if (o.startsWith('external-editors-')) {
      const launchers: ReadonlyArray<IEditorInfo> = parseLaunchers(localStorage[o])
      const ext = o.substring(17)
      result.set(ext, launchers)
    }
  }

  return result
}

function setEditorList(ext: string, info: IEditorInfo[]) {
  const data = JSON.stringify(info)
  const key = 'external-editors-' + ext
  localStorage.setItem(key, data)
}

function getEditorList(path: string): Promise<IEditorLauncher[]> {
  const result = new Array<IEditorLauncher>()
  const ext = Path.extname(path)

  const editorInfo: ReadonlyArray<IEditorInfo> | undefined = getAllEditors().get(ext)
  if (editorInfo) {
    for (let i = 0; i < editorInfo.length; i++) {
      result.push(new AppLauncher(editorInfo[i].name, editorInfo[i].cmd, path))
    }
  }

  return Promise.resolve(result)
}

function removeEditors(ext: string) {
  const key = 'external-editors-' + ext
  localStorage.removeItem(key)
}

export const shell: IAppShell = {
  moveItemToTrash: electronShell.moveItemToTrash,
  beep: electronShell.beep,
  openExternal: path => {
    return new Promise<boolean>((resolve, reject) => {
      ipcRenderer.once(
        'open-external-result',
        (event: Electron.IpcMessageEvent, { result }: { result: boolean }) => {
          resolve(result)
        }
      )

      ipcRenderer.send('open-external', { path })
    })
  },
  showItemInFolder: path => {
    ipcRenderer.send('show-item-in-folder', { path })
  },
  openItem: electronShell.openItem,
  getEditors: getEditorList,
  setEditors: setEditorList,
  getAllEditors: getAllEditors,
  removeEditors: removeEditors,
}
