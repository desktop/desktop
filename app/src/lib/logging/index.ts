import * as Path from 'path'
import * as Fs from 'fs'
import * as Os from 'os'

import * as winston from 'winston'
require('winston-daily-rotate-file')

import { ElectronConsole } from './electron-console'

function getLogFilePath(): string {
  if (__WIN32__) {
    return `${process.env.LOCALAPPDATA}\\desktop\\desktop.production.log`
  } else {
    const home = Os.homedir()
    return `${home}/Library/Logs/GitHub/desktop.production.log`
  }
}

function createDirectoryIfNotFound(path: string) {
  const dirname = Path.dirname(path)
  if (!Fs.existsSync(dirname)) {
    Fs.mkdirSync(dirname)
  }
}

const filename = getLogFilePath()
createDirectoryIfNotFound(filename)

if (__DEV__) {
  // log everything to the console
  winston.configure({
    transports: [
      new (ElectronConsole)(),
      // TODO: remove this after testing
      new winston.transports.DailyRotateFile({
        filename,
        humanReadableUnhandledException: true,
        handleExceptions: true,
        json: false,
        datePattern: 'yyyy-MM-dd.',
        prepend: true,
        level: 'debug',
      }),
    ],
  })
} else {
  winston.configure({
    transports: [
      // only display errors in the console
      new ElectronConsole({
        level: 'error',
      }),
      new winston.transports.DailyRotateFile({
        filename,
        humanReadableUnhandledException: true,
        handleExceptions: true,
        json: false,
        datePattern: 'yyyy-MM-dd.',
        prepend: true,
        level: 'info',
      }),
    ],
  })
}

export const logger = {
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
