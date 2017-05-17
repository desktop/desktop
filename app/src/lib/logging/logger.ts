import { app } from 'electron'
import * as winston from 'winston'
require('winston-daily-rotate-file')

import * as Fs from 'fs-extra'
import * as Path from 'path'

import { ElectronConsole } from './electron-console'

export const LogFolder = 'logs'

export interface ILogger {
  readonly debug: (message: string) => void
  readonly info: (message: string) => void
  readonly error: (message: string) => void
}

/** resolve the log file location based on the current environment */
export function getLogFilePath(directory: string): string {
  const environment = process.env.NODE_ENV || 'production'
  const fileName = `desktop.${environment}.log`
  return Path.join(directory, fileName)
}

function initializeWinston(path: string) {
  const fileLogger = new winston.transports.DailyRotateFile({
    filename: path,
    // We'll do this ourselves, thank you
    handleExceptions: false,
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
    debug: winston.debug,
    info: winston.info,
    error: winston.error,
  }
}

let logger: ILogger | null = null

export async function getLogger(): Promise<ILogger> {

  if (logger) {
    return logger
  }

  const userData = app.getPath('userData')
  const directory = Path.join(userData, LogFolder)

  return await new Promise<ILogger>((resolve, reject) => {
    Fs.mkdir(directory, (error) => {
      if (error) {
        if (error.code !== 'EEXIST') {
          reject(error)
          return
        }
      }

      const logger = initializeWinston(getLogFilePath(directory))
      resolve(logger)
    })
  })
}

