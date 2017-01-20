import { proxyRequest } from '../ui/main-process-proxy'
import { IHTTPRequest } from './http'

import { logger } from './logging'

const ErrorEndpoint = 'https://central.github.com/api/desktop/exception'

/** Report the error to Central. */
export async function reportError(error: Error, version: string) {
  if (__DEV__ || process.env.TEST_ENV) {
    logger.error(`An uncaught exception was thrown. If this were a production build it would be reported to Central. Instead, maybe give it a lil lookyloo.`, error)
    return
  }

  const body = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    version,
  }

  const options: IHTTPRequest = {
    method: 'POST',
    url: ErrorEndpoint,
    body,
  }

  try {
    await proxyRequest(options)
    logger.error('[reportError] exception reported to Central', error)
  } catch (e) {
    logger.error('[reportError] unable to submit report', e)
  }
}
