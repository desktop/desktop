import { app  } from 'electron'
import * as Path from 'path'

import { ILogger, createLogger, LogFolder } from './logger'

let logger: ILogger | null = null

async function getLogger(): Promise<ILogger> {
  if (!logger) {
    const userData = app.getPath('userData')
    const directory = Path.join(userData, LogFolder)
    logger = await createLogger(directory)
  }
  return logger
}

export async function logError(message: string, error?: Error): Promise<void> {
  const logger = await getLogger()
  logger.error(message, error)
}
