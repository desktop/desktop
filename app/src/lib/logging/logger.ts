import * as winston from 'winston'
require('winston-daily-rotate-file')

import * as Fs from 'fs-extra'
import * as Path from 'path'

import { ElectronConsole } from './electron-console'

export const LogFolder = 'logs'

export interface ILogger {
  readonly debug: (message: string) => void
  readonly info: (message: string) => void
  readonly error: (message: string, error?: Error) => void
}

/** resolve the log file location based on the current environment */
export function getLogFilePath(directory: string): string {
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

export function createLogger(directory: string): Promise<ILogger> {
  return new Promise<ILogger>((resolve, reject) => {
    Fs.mkdir(directory, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve(create(getLogFilePath(directory)))
      }
    })
  })
}

