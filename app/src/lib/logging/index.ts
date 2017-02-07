import * as winston from 'winston'
require('winston-daily-rotate-file')

import * as Path from 'path'

import { ElectronConsole } from './electron-console'

import { getUserDataPath as getUserDataPathRenderer } from '../../ui/lib/app-proxy'

function getUserDataPathMain() {
  const { app } = require('electron')
  return app.getPath('userData')
}

function getLogFilePath(mainProcess: boolean): string {
  const path = mainProcess
    ? getUserDataPathMain()
    : getUserDataPathRenderer()

  const environment = process.env.NODE_ENV || 'production'
  const fileName = `desktop.${environment}.log`
  return Path.join(path, fileName)
}

interface ILogger {
  filename: string,
  debug: (message: string) => void,
  info: (message: string) => void,
  error: (message: string, error?: Error) => void
}

let logger: ILogger | null = null

function create(mainProcess: boolean = false) {
  const filename = getLogFilePath(mainProcess)
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
    filename,
    debug: (message: string) => winston.debug(message),
    info: (message: string) => winston.info(message),
    error: (message: string, error?: Error) => {
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

export function getMainProcessLogger(): ILogger {
  if (!logger) {
    logger = create(true)
  }
  return logger
}

