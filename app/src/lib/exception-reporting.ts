import * as request from 'request'

const ErrorEndpoint = 'https://central.github.com/api/desktop/exception'

/** Report the error to Central. */
export function reportError(error: Error, version: string) {
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
