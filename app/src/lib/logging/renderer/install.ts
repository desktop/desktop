import { ipcRenderer } from 'electron'
import { LogLevel } from '../log-level'
import { formatLogMessage } from '../format-log-message'

const g = global as any

/**
 * Dispatches the given log entry to the main process where it will be picked
 * written to all log transports. See initializeWinston in logger.ts for more
 * details about what transports we set up.
 */
function log(level: LogLevel, message: string, error?: Error) {
  ipcRenderer.send('log', level, formatLogMessage(`[${__PROCESS_KIND__}] ${message}`, error))
}

g.log = <IDesktopLogger>{
  error(message: string, error?: Error) {
    console.error(message)
    log('error', message, error)
  },
  warn(message: string, error?: Error) {
    console.warn(message)
    log('warn', message, error)
  },
  info(message: string, error?: Error) {
    console.info(message)
    log('info', message, error)
  },
  debug(message: string, error?: Error) {
    console.debug(message)
    log('debug', message, error)
  },
}
