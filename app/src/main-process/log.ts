import * as Path from 'path'
import * as winston from 'winston'
import { getLogDirectoryPath } from '../lib/logging/get-log-path'
import { LogLevel } from '../lib/logging/log-level'
import { noop } from 'lodash'
import { DesktopConsoleTransport } from './desktop-console-transport'
import 'winston-daily-rotate-file'
import memoizeOne from 'memoize-one'
import { mkdir } from 'fs/promises'

/**
 * The maximum number of log files we should have on disk before pruning old
 * ones.
 */
const MaxLogFiles = 14

/**
 * Initializes winston and returns a subset of the available log level
 * methods (debug, info, error). This method should only be called once
 * during an application's lifetime.
 *
 * @param path The path where to write log files.
 */
function initializeWinston(path: string): winston.LogMethod {
  const filename = Path.join(path, `%DATE%.desktop.${__RELEASE_CHANNEL__}.log`)
  const timestamp = () => new Date().toISOString()

  const fileLogger = new winston.transports.DailyRotateFile({
    filename,
    datePattern: 'YYYY-MM-DD',
    level: 'info',
    maxFiles: MaxLogFiles,
    format: winston.format.printf(
      ({ level, message }) => `${timestamp()} - ${level}: ${message}`
    ),
  })

  // The file logger handles errors when it can't write to an existing file but
  // emits an error when attempting to create a file and failing (for example
  // due to permissions or the disk being full). If logging fails that's not a
  // big deal so we'll just suppress any error, besides, the console logger will
  // likely still work.
  fileLogger.on('error', noop)

  const consoleLogger = new DesktopConsoleTransport({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'error',
  })

  winston.configure({
    transports: [consoleLogger, fileLogger],
    format: winston.format.simple(),
  })

  return winston.log
}

/**
 * Initializes and configures winston (if necessary) to write to Electron's
 * console as well as to disk.
 *
 * @returns a function reference which can be used to write log entries,
 *          this function is equivalent to that of winston.log in that
 *          it accepts a log level, a message and an optional callback
 *          for when the event has been written to all destinations.
 */
const getLogger = memoizeOne(async () => {
  const logDirectory = getLogDirectoryPath()
  await mkdir(logDirectory, { recursive: true })
  return initializeWinston(logDirectory)
})

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
