import * as request from 'request'
import * as app from '../ui/lib/app'

const ErrorEndpoint = 'https://central.github.com/api/desktop/exception'

/** Report the error to Central. */
export function reportError(error: Error) {
  const payload = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    version: app.getVersion(),
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
