import { log } from '../../../ui/main-process-proxy'
import { formatLogMessage } from '../format-log-message'

const g = global as any

g.log = {
  error(message: string, error?: Error) {
    log({ level: 'error', message: formatLogMessage(message, error) })
  },
  warn(message: string, error?: Error) {
    log({ level: 'warn', message: formatLogMessage(message, error) })
  },
  info(message: string, error?: Error) {
    log({ level: 'info', message: formatLogMessage(message, error) })
  },
  debug(message: string, error?: Error) {
    log({ level: 'debug', message: formatLogMessage(message, error) })
  },
}
