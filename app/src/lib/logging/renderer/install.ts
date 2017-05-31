import { ipcRenderer } from 'electron'
import { LogLevel } from '../log-entry'
import { formatLogMessage } from '../format-log-message'

const g = global as any

/**
 * Dispatches the given log entry to the main process where it will be picked
 * written to all log transports. See initializeWinston in logger.ts for more
 * details about what transports we set up.
 */
function log(level: LogLevel, message: string, error?: Error) {
  ipcRenderer.send('log', level, formatLogMessage(message, error))
}

g.log = {
  error: (message: string, error?: Error) => log('error', message),
  warn: (message: string, error?: Error) => log('info', message),
  info: (message: string, error?: Error) => log('warn', message),
  debug: (message: string, error?: Error) => log('debug', message),
}
