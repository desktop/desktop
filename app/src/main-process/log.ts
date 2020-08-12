import * as Path from 'path'
import * as winston from 'winston'

import { getLogDirectoryPath } from '../lib/logging/get-log-path'
import { LogLevel } from '../lib/logging/log-level'
import { ensureDir } from 'fs-extra'

import 'winston-daily-rotate-file'

/**
 * The maximum number of log files we should have on disk before pruning old
 * ones.
 */
const MaxLogFiles = 14

/** resolve the log file location based on the current channel */
function getLogFilePath(directory: string): string {
  const channel = __RELEASE_CHANNEL__
  const fileName = `desktop.${channel}.log`
  return Path.join(directory, fileName)
}

/**
 * Initializes winston and returns a subset of the available log level
 * methods (debug, info, error). This method should only be called once
 * during an application's lifetime.
 *
 * @param path The path where to write log files. This path will have
 *             the current date prepended to the basename part of the
 *             path such that passing a path '/logs/foo' will end up
 *             writing to '/logs/2017-05-17.foo'
 */
function initializeWinston(path: string): winston.LogMethod {
  const fileLogger = new winston.transports.DailyRotateFile({
    filename: path,
    // We'll do this ourselves, thank you
    handleExceptions: false,
    json: false,
    datePattern: 'yyyy-MM-dd.',
    prepend: true,
    // log everything interesting (info and up)
    level: 'info',
    maxFiles: MaxLogFiles,
  })

  // The file logger handles errors when it can't write to an
  // existing file but emits an error when attempting to create
  // a file and failing (for example due to permissions or the
  // disk being full). If logging fails that's not a big deal
  // so we'll just suppress any error, besides, the console
  // logger will likely still work.
  fileLogger.on('error', () => {})

  const consoleLogger = new winston.transports.Console({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'error',
  })

  winston.configure({
    transports: [consoleLogger, fileLogger],
  })

  return winston.log
}

let loggerPromise: Promise<winston.LogMethod> | null = null

/**
 * Initializes and configures winston (if necessary) to write to Electron's
 * console as well as to disk.
 *
 * @returns a function reference which can be used to write log entries,
 *          this function is equivalent to that of winston.log in that
 *          it accepts a log level, a message and an optional callback
 *          for when the event has been written to all destinations.
 */
function getLogger(): Promise<winston.LogMethod> {
  if (loggerPromise) {
    return loggerPromise
  }

  loggerPromise = new Promise<winston.LogMethod>((resolve, reject) => {
    const logDirectory = getLogDirectoryPath()

    ensureDir(logDirectory)
      .then(() => {
        try {
          const logger = initializeWinston(getLogFilePath(logDirectory))
          resolve(logger)
        } catch (err) {
          reject(err)
        }
      })
      .catch(error => {
        reject(error)
      })
  })

  return loggerPromise
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
export async function log(level: LogLevel, message: string) {
  try {
    const logger = await getLogger()
    await new Promise<void>((resolve, reject) => {
      logger(level, message, error => {
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
