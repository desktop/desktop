import * as request from 'request'

const ErrorEndpoint = 'https://central.github.com/api/desktop/exception'

/** Report the error to Central. */
export function reportError(error: Error, version: string) {
  console.error(error)

  if (__DEV__ || process.env.TEST_ENV) {
    console.error(`An uncaught exception was thrown. If this were a production build it would be reported to Central. Instead, maybe give it a lil lookyloo.`)
    return
  }

  const payload = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    version,
  }

  const options = {
    formData: payload,
    json: true,
  }

  request.post(ErrorEndpoint, options, (error, response, body) => {
    if (error) {
      console.error('Error submitting exception report:')
      console.error(error)
    } else {
      console.log('Exception reported.')
    }
  })
}
