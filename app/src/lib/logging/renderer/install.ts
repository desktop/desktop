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
  ipcRenderer.send(
    'log',
    level,
    formatLogMessage(`[${__PROCESS_KIND__}] ${message}`, error)
  )
}

g.log = {
  error(message: string, error?: Error) {
    log('error', message, error)
    console.error(formatLogMessage(message, error))
  },
  warn(message: string, error?: Error) {
    log('warn', message, error)
    console.warn(formatLogMessage(message, error))
  },
  info(message: string, error?: Error) {
    log('info', message, error)
    console.info(formatLogMessage(message, error))
  },
  debug(message: string, error?: Error) {
    log('debug', message, error)
    console.debug(formatLogMessage(message, error))
  },
} as IDesktopLogger
