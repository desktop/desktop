import { getUserDataPath  } from '../../ui/lib/app-proxy'
import * as Path from 'path'

import { ILogger, createLogger, LogFolder } from './logger'

let logger: ILogger | null = null

async function getLogger(): Promise<ILogger> {
  if (!logger) {
    const directory = Path.join(getUserDataPath(), LogFolder)
    logger = await createLogger(directory)
  }
  return logger
}

export async function logError(message: string, error?: Error): Promise<void> {
  const logger = await getLogger()
  logger.error(message, error)
}
