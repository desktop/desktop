import * as winston from 'winston'
require('winston-daily-rotate-file')

import { ElectronConsole } from './electron-console'

import { getUserDataPath } from '../../ui/lib/app-proxy'

function getLogFilePath(): string {
  return `${getUserDataPath()}\\desktop.${process.env.NODE_ENV || 'production'}.log`
}

interface ILogger {
  debug: (message: string) => void,
  info: (message: string) => void,
  error: (message: string, error?: Error) => void
}

let logger: ILogger | null = null

function create() {
  if (process.env.NODE_ENV === 'development') {
    winston.configure({
      transports: [
        new ElectronConsole(),
      ],
    })
  } else {
    winston.configure({
      transports: [
        // only log errors to the console
        new ElectronConsole({
          level: 'error',
        }),
        new winston.transports.DailyRotateFile({
          filename: getLogFilePath(),
          humanReadableUnhandledException: true,
          handleExceptions: true,
          json: false,
          datePattern: 'yyyy-MM-dd.',
          prepend: true,
          // log everything interesting (info and up)
          level: 'info',
        }),
      ],
    })
  }

  return {
    debug: function(message: string) {
      winston.debug(message)
    },
    info: function(message: string) {
      winston.info(message)
    },
    error: function(message: string, error?: Error) {
      if (error) {
        winston.error(message, { error: error })
      } else {
        winston.error(message)
      }
    },
  }
}

export function getLogger(): ILogger {
  if (!logger) {
    logger = create()
  }
  return logger
}
