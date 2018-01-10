import * as Path from 'path'
import * as Fs from 'fs'

function getLogDirectoryPath() {
  const appData = process.env.APPDATA
  const folderName = __DEV__ ? 'GitHub Desktop-dev' : 'GitHub Desktop'
  const directory = Path.join(appData, folderName, 'logs')
  return directory
}

const askPassLogFile = 'ask-pass.log'

export function appendToAskPassLog(message: string) {
  if (!__WIN32__) {
    return
  }

  const file = Path.join(getLogDirectoryPath(), askPassLogFile)
  // eslint-disable-next-line no-sync
  Fs.appendFileSync(file, `${message}\n`)
}
