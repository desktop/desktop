import * as winston from 'winston'
const Transport = winston.Transport

type LogLevel = 'emerg' | 'alert' | 'crit' | 'error' | 'warning' | 'notice' | 'info' | 'debug';

export class ElectronConsole extends Transport {

  public constructor(options?: winston.ConsoleTransportOptions) {
    super(options)
  }

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
