import * as winston from 'winston'
const Transport = winston.Transport

type LogLevel = 'emerg' | 'alert' | 'crit' | 'error' | 'warning' | 'notice' | 'info' | 'debug'

/**
 * A logger that writes messages to the DevTools in Chrome.
 *
 * Winston's included Console logger writes to `process.stdout`
 * and `process.stderr` which are not visible to the user.
 */
export class ElectronConsole extends Transport {

  public log (level: LogLevel, message: string, meta?: any[], callback?: winston.LogCallback)  {
    if (level === 'emerg' ||
        level === 'alert' ||
        level === 'crit' ||
        level === 'error') {
      // TODO: check opened state of dev tools
      //       - if not opened, open dev tools
      if (meta && meta.length) {
        console.error(message, meta)
      } else {
        console.error(message)
      }
      return
    }

    if (level === 'info' ||
        level === 'notice') {
      if (meta && meta.length) {
        console.info(message, meta)
      } else {
        console.info(message)
      }
      return
    }

    if (level === 'debug') {
      if (meta && meta.length) {
        console.debug(message, meta)
      } else {
        console.debug(message)
      }
    }
  }
}
