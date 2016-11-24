import { proxyRequest } from '../ui/main-process-proxy'

const ErrorEndpoint = 'https://central.github.com/api/desktop/exception'

/** Report the error to Central. */
export async function reportError(error: Error, version: string) {
  console.error(error)

  if (__DEV__ || process.env.TEST_ENV) {
    console.error(`An uncaught exception was thrown. If this were a production build it would be reported to Central. Instead, maybe give it a lil lookyloo.`)
    return
  }

  const body = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    version,
  }

  const options: Electron.RequestOptions = {
    method: 'POST',
    url: ErrorEndpoint,
  }

  try {
    await proxyRequest(options, JSON.stringify(body))
    console.log('Exception reported.')
  } catch (e) {
    console.error('Error submitting exception report:')
    console.error(e)
  }
}
