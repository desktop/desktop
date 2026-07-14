import { formatError } from './format-error'

export function formatLogMessage(message: string, error?: Error) {
  return error ? formatError(error, message) : message
}
