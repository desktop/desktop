import { formatError } from './main'
import { log } from '../../ui/main-process-proxy'

export function logInfo(message: string) {
  log({ level: 'info', message })
}

export function logDebug(message: string) {
  log({ level: 'debug', message })
}

export function logError(message: string, error?: Error) {
  if (error) {
    log({ level: 'error', message: formatError(error, message) })
  } else {
    log({ level: 'error', message })
  }
}
