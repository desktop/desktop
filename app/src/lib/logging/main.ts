import { app } from 'electron'
import * as Path from 'path'
import { createLogger, ILogger, LogFolder } from '../logging/logger'
import { assertNever } from '../fatal-error'

export interface ILogEntry {
  kind: 'info' | 'debug' | 'error'
  readonly message: string
}

function write(entry: ILogEntry, logger: ILogger) {
  switch (entry.kind) {
    case 'info': return logger.info(entry.message)
    case 'debug': return logger.info(entry.message)
    case 'error': return logger.error(entry.message)
  }

  assertNever(entry.kind, `Unknown entry type ${entry.kind}`)
}

export function formatError(error: Error, title?: string) {
  if (error.stack) {
    return title
      ? `${title}\n${error.stack}`
      : error.stack.trim()
  } else {
    return title
      ? `${title}\n    ${error.name}: ${error.message}`
      : `${error.name}: ${error.message}`
  }
}

class Logger {

  private logger: ILogger | null = null
  private isCreatingLogger = false
  private readonly queue = new Array<ILogEntry>()

  private async createLogger() {

    if (this.isCreatingLogger) {
      return
    }

    const userData = app.getPath('userData')
    const directory = Path.join(userData, LogFolder)

    try {
      this.logger = await createLogger(directory)
    } catch (error) {
      /* welp */
      return
    }
    this.isCreatingLogger = false

    // Drain the queue
    const logger = this.logger

    this.queue.forEach(entry => write(entry, logger))
    this.queue.length = 0
  }

  public log(entry: ILogEntry) {
    if (!this.logger) {
      this.createLogger()
      this.queue.push(entry)

      if (this.queue.length > 500) {
        this.queue.shift()
      }
    } else {
      write(entry, this.logger)
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
