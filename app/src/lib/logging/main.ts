import { getLogger } from '../logging/logger'
import { LogMethod } from 'winston'

/**
 * The maximum number of log entries to store while instantiating the logger.
 */
const maxQueueSize = 500

export interface ILogEntry {
  kind: 'info' | 'debug' | 'error'
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

class Logger {

  private logger: LogMethod | null = null
  private isCreatingLogger = false
  private readonly queue = new Array<ILogEntry>()

  private async createLogger() {

    if (this.isCreatingLogger) {
      return
    }

    try {
      this.logger = await getLogger()
    } catch (error) {
      /* welp */
      return
    }
    this.isCreatingLogger = false

    // Drain the queue
    const logger = this.logger

    this.queue.forEach(entry => logger(entry.kind, entry.message))
    this.queue.length = 0
  }

  public log(entry: ILogEntry) {
    if (!this.logger) {
      this.createLogger()
      this.queue.push(entry)

      if (this.queue.length > maxQueueSize) {
        this.queue.shift()
      }
    } else {
      this.logger(entry.kind, entry.message)
    }
  }

  public debug(message: string) {
    this.log({ kind: 'debug', message })
  }

  public info(message: string) {
    this.log({ kind: 'info', message })
  }

  public error(message: string) {
    this.log({ kind: 'error', message })
  }
}

const logger = new Logger()

export function log(entry: ILogEntry) {
  logger.log(entry)
}

export function logInfo(message: string) {
  logger.info(message)
}

export function logDebug(message: string) {
  logger.debug(message)
}

export function logError(message: string, error?: Error) {
  if (error) {
    logger.error(formatError(error, message))
  } else {
    logger.error(message)
  }
}
