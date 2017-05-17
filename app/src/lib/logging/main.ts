import { getLogger } from '../logging/logger'
import { formatError } from './format-error'

export interface ILogEntry {
  level: 'info' | 'debug' | 'error'
  readonly message: string
}

/**
 * Write the given log entry to all configured transports,
 * see initializeWinston in logger.ts for more details about
 * what transports we set up.
 * 
 * Returns a promise that will never yield an error and which
 * resolves when the log entry has been written to all transports
 * or if the entry could not be written due to an error.
 */
export async function log(entry: ILogEntry) {
  try {
    const logger = await getLogger()
    await new Promise<void>((resolve, reject) => {
      logger(entry.level, entry.message, (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  } catch (error) {
    /**
     * Welp. I guess we have to ignore this for now, we
     * don't have any good mechanisms for reporting this.
     * In the future we can discuss whether we should
     * IPC to the renderer or dump it somewhere else
     * but for now logging isn't a critical thing.
     */
  }
}

/**
 * Write the given log message to all configured transports,
 * with the 'info' log level. See initializeWinston in logger.ts
 * for more details about what transports we set up.
 * 
 * Returns a promise that will never yield an error and which
 * resolves when the log entry has been written to all transports
 * or if the entry could not be written due to an error.
 */
export function logInfo(message: string) {
  return log({ level: 'info', message })
}

/**
 * Write the given log message to all configured transports,
 * with the 'debug' log level. See initializeWinston in logger.ts
 * for more details about what transports we set up.
 * 
 * Returns a promise that will never yield an error and which
 * resolves when the log entry has been written to all transports
 * or if the entry could not be written due to an error.
 */
export function logDebug(message: string) {
  return log({ level: 'debug', message })
}

/**
 * Write the given log message to all configured transports,
 * with the 'error' log level. See initializeWinston in logger.ts
 * for more details about what transports we set up.
 * 
 * Returns a promise that will never yield an error and which
 * resolves when the log entry has been written to all transports
 * or if the entry could not be written due to an error.
 */
export function logError(message: string, error?: Error) {
  return log({
    level: 'error',
    message: error
      ? formatError(error, message)
      : message,
  })
}
