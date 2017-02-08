import * as winston from 'winston'
require('winston-daily-rotate-file')

import * as Path from 'path'

import { ElectronConsole } from './electron-console'

interface ILogger {
  readonly debug: (message: string) => void
  readonly info: (message: string) => void
  readonly error: (message: string, error?: Error) => void
}

/** resolve the log file location based on the current environment */
function getLogFilePath(directory: string): string {
  const environment = process.env.NODE_ENV || 'production'
  const fileName = `desktop.${environment}.log`
  return Path.join(directory, fileName)
}

/** wireup the file and console loggers */
function create(filename: string) {
  const fileLogger = new winston.transports.DailyRotateFile({
    filename,
    humanReadableUnhandledException: true,
    handleExceptions: true,
    json: false,
    datePattern: 'yyyy-MM-dd.',
    prepend: true,
    // log everything interesting (info and up)
    level: 'info',
  })

  const level = process.env.NODE_ENV === 'development' ? 'debug' : 'error'
  const consoleLogger = new ElectronConsole({
    level,
  })

  winston.configure({
    transports: [
      consoleLogger,
      fileLogger,
    ],
  })

  return {
    debug: (message: string) => winston.debug(message),
    info: (message: string) => winston.info(message),
    error: (message: string, error?: Error) => {
      if (error) {
        winston.error(message)
        winston.error(` - name: ${error.name}`)
        winston.error(` - message: ${error.message}`)
        winston.error(` - stack: ${error.stack}`)
      } else {
        winston.error(message)
      }
    },
  }
}

// TODO: confirm that one logger is instantiated once for the renderer process
//       and once for the main process
let logger: ILogger | null = null

export function getLogger(directory: string): ILogger {
  if (!logger) {
    logger = create(getLogFilePath(directory))
  }
  return logger
}

