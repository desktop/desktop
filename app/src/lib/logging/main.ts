import { getLogger } from '../logging/logger'

export interface ILogEntry {
  level: 'info' | 'debug' | 'error'
  readonly message: string
}

/**
 * Formats an error for log file output. Use this instead of
 * multiple calls to log.error.
 */
export function formatError(error: Error, title?: string) {
  if (error.stack) {
    return title
      ? `${title}\n${error.stack}`
      : error.stack.trim()
  } else {
    return title
      ? `${title}\n${error.name}: ${error.message}`
      : `${error.name}: ${error.message}`
  }
}

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

export function logInfo(message: string) {
  return log({ level: 'info', message })
}

export function logDebug(message: string) {
  return log({ level: 'debug', message })
}

export function logError(message: string, error?: Error) {
  return log({
    level: 'error',
    message: error
      ? formatError(error, message)
      : message,
  })
}
