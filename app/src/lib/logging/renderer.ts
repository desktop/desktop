import { getUserDataPath  } from '../../ui/lib/app-proxy'

import { ILogger, createLogger } from './logger'

let logger: ILogger | null = null

export function getLogger(): ILogger {
  if (!logger) {
    logger = createLogger(getUserDataPath())
  }
  return logger
}
