const ErrorEndpoint = 'https://central.github.com/api/desktop/exception'

/** Report the error to Central. */
export async function reportError(error: Error, version: string) {
  if (__DEV__ || process.env.TEST_ENV) {
    console.error(`An uncaught exception was thrown. If this were a production build it would be reported to Central. Instead, maybe give it a lil lookyloo.`)
    return
  }

  const data = new FormData()
  data.append('name', error.name)
  data.append('message', error.message)
  data.append('version', version)
  if (error.stack) {
    data.append('stack', error.stack)
  }

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
