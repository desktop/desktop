import { getUserDataPath  } from '../../ui/lib/app-proxy'
import * as Path from 'path'

import { ILogger, createLogger } from './logger'

let logger: ILogger | null = null

export function getLogger(): ILogger {
  if (!logger) {
    const directory = Path.join(getUserDataPath(), 'logs')
    logger = createLogger(directory)
  }
  return logger
}
