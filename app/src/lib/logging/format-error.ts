import { withSourceMappedStack } from '../source-map-support'

/**
 * Formats an error for log file output. Use this instead of
 * multiple calls to log.error.
 */
export function formatError(error: Error, title?: string) {
  error = withSourceMappedStack(error)

  if (error.stack) {
    return title ? `${title}\n${error.stack}` : error.stack.trim()
  } else {
    return title
      ? `${title}\n${error.name}: ${error.message}`
      : `${error.name}: ${error.message}`
  }
}
