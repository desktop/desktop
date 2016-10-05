import * as https from 'https'
import * as app from '../ui/lib/app'

export function reportError(error: Error) {
  debugger
  const payload = JSON.stringify({
    name: error.name,
    message: error.message,
    stack: error.stack,
    version: app.getVersion(),
  })

  const options = {
    hostname: 'central.github.com',
    path: '/api/desktop/exception',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }

  const req = https.request(options, response => {
    let result = ''

    response.on('data', (chunk: any) => {
      result += chunk
    })

    response.on('end', () => {
      if (response.statusCode !== 200) {
        console.error(`Error reporting exception: ${response.statusMessage}`)
      } else {
        console.log(`Exception reported. Response: ${result}`)
        console.log(response)
      }
    })
  })
  req.end(payload)
}
