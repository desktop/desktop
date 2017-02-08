import { app  } from 'electron'

import { ILogger, createLogger } from './logger'

let logger: ILogger | null = null

export function getLogger(): ILogger {
  if (!logger) {
    logger = createLogger(app.getPath('userData'))
  }
  return logger
}
