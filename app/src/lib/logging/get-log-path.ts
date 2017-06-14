import * as Path from 'path'
import { app } from 'electron'

let logFilePath: string | null = null

export function getLogPath() {
  if (!logFilePath) {
    const userData = app.getPath('userData')
    logFilePath = Path.join(userData, 'logs')
  }

  return logFilePath
}
