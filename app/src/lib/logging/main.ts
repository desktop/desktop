import { app  } from 'electron'
import * as Path from 'path'

import { ILogger, createLogger } from './logger'

let logger: ILogger | null = null

export function getLogger(): ILogger {
  if (!logger) {
    const userData = app.getPath('userData')
    const directory = Path.join(userData, 'logs')
    logger = createLogger(directory)
  }
  return logger
}
