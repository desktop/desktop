import { log } from '../../../main-process/log'
import { formatLogMessage } from '../format-log-message'

const g = global as any

g.log = {
  error(message: string, error?: Error) {
    log('error', formatLogMessage(message, error))
  },
  warn(message: string, error?: Error) {
    log('warn', formatLogMessage(message, error))
  },
  info(message: string, error?: Error) {
    log('info', formatLogMessage(message, error))
  },
  debug(message: string, error?: Error) {
    log('debug', formatLogMessage(message, error))
  },
}
