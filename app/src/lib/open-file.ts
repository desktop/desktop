import { shell } from 'electron'

export function openFile(fullPath: string) {

  const url = `file://${fullPath}`

  if (!shell.openExternal(url)) {
    console.log('did we do something interesting here?')
  }
}
