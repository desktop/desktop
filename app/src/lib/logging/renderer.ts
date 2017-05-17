import { formatError } from './main'
import { log } from '../../ui/main-process-proxy'

export function logInfo(message: string) {
  log({ kind: 'info', message })
}

export function logDebug(message: string) {
  log({ kind: 'debug', message })
}

export function logError(message: string, error?: Error) {
  if (error) {
    log({ kind: 'error', message: formatError(error, message) })
  } else {
    log({ kind: 'error', message })
  }
}
