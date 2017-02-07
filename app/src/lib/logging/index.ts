import * as winston from 'winston'
require('winston-daily-rotate-file')

import * as Path from 'path'

import { ElectronConsole } from './electron-console'

import { getUserDataPath as getUserDataPathRenderer } from '../../ui/lib/app-proxy'

interface ILogger {
  filename: string,
  debug: (message: string) => void,
  info: (message: string) => void,
  error: (message: string, error?: Error) => void
}

let mainPath: string | null = null

/** retrieve the userData path using the main process API */
function getUserDataPathMain() {
  if (mainPath === null) {
    const { app } = require('electron')
    mainPath = app.getPath('userData')
  }

  return mainPath
}

/** resolve the log file location based on the current environment */
function getLogFilePath(mainProcess: boolean): string {
  const path = mainProcess
    ? getUserDataPathMain()
    : getUserDataPathRenderer()

  const environment = process.env.NODE_ENV || 'production'
  const fileName = `desktop.${environment}.log`
  return Path.join(path, fileName)
}

let logger: ILogger | null = null

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
    filename,
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

/** create a logger that's usable from the renderer process */
export function getLogger(): ILogger {
  if (!logger) {
    const filename = getLogFilePath(false)
    logger = create(filename)
  }
  return logger
}

/** create a logger that's usable from the main process */
export function getMainProcessLogger(): ILogger {
  if (!logger) {
    const filename = getLogFilePath(false)
    logger = create(filename)
  }
  return logger
}

