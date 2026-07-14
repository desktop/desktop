import * as winston from 'winston'
import { getLogDirectoryPath } from '../lib/logging/get-log-path'
import { LogLevel } from '../lib/logging/log-level'
import noop from 'lodash/noop'
import { DesktopConsoleTransport } from './desktop-console-transport'
import memoizeOne from 'memoize-one'
import { mkdir } from 'fs/promises'
import { DesktopFileTransport } from './desktop-file-transport'

/**
 * Initializes winston and returns a subset of the available log level
 * methods (debug, info, error). This method should only be called once
 * during an application's lifetime.
 *
 * @param path The path where to write log files.
 */
function initializeWinston(path: string): winston.LogMethod {
  const timestamp = () => new Date().toISOString()

  const fileLogger = new DesktopFileTransport({
    logDirectory: path,
    level: 'info',
    format: winston.format.printf(
      ({ level, message }) => `${timestamp()} - ${level}: ${message}`
    ),
  })

  // The file transport shouldn't emit anything but just in case it does we want
  // a listener or else it'll bubble to an unhandled exception.
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
