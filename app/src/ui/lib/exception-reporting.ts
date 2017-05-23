import { getVersion } from './app-proxy'
import { getOS } from '../../lib/get-os'
import { getGUID } from '../../lib/stats'

const ErrorEndpoint = 'https://central.github.com/api/desktop/exception'

/** Report the error to Central. */
export async function reportError(error: Error) {
  if (__DEV__ || process.env.TEST_ENV) {
    console.error(`An uncaught exception was thrown. If this were a production build it would be reported to Central. Instead, maybe give it a lil lookyloo.`)
    return
  }

  const data = new FormData()
  data.append('name', error.name)
  data.append('message', error.message)
  if (error.stack) {
    data.append('stack', error.stack)
  }

  data.append('version', getVersion())
  data.append('osVersion', getOS())
  data.append('platform', process.platform)
  data.append('guid', getGUID())

  const options = {
    method: 'POST',
    body: data,
  }

  try {
    const response = await fetch(ErrorEndpoint, options)
    if (response.ok) {
      console.log('Exception reported.')
    } else {
      throw new Error(`Error submitting exception report: ${response.statusText} (${response.status})`)
    }
  } catch (e) {
    console.error('Error submitting exception report:', e)
  }
}
