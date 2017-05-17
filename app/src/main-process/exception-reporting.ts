import { app } from 'electron'
import { logInfo, logError } from '../lib/logging/main'

const ErrorEndpoint = 'https://central.github.com/api/desktop/exception'

/** Report the error to Central. */
export async function reportError(error: Error, extra?: { [key: string]: string }) {
  const data = new FormData()
  data.append('name', error.name)
  data.append('message', error.message)

  if (error.stack) {
    data.append('stack', error.stack)
  }

  data.append('platform', process.platform)
  data.append('version', app.getVersion())

  if (extra) {
    for (const key of Object.keys(extra)) {
      data.append(key, extra[key])
    }
  }

  const options = {
    method: 'POST',
    body: data,
  }

  try {
    const response = await fetch(ErrorEndpoint, options)
    if (response.ok) {
      logInfo('Exception reported.')
    } else {
      throw new Error(`Error submitting exception report: ${response.statusText} (${response.status})`)
    }
  } catch (e) {
    logError('Error submitting exception report:', e)
  }
}
