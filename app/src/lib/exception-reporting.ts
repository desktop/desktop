import * as http from 'http'
import * as app from '../ui/lib/app'

export function reportError(error: Error) {
  debugger
  const options = {
    host: 'https://central.github.com',
    path: '/api/desktop/exception',
    method: 'POST',
  }

  const payload = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    version: app.getVersion(),
  }
  console.log(payload)

  const req = http.request(options, response => {
    const result = ''

    response.on('data', chunk => {
      result += chunk
    })

    response.on('end', () => {
      console.log(`Exception reported. Response: ${result}`)
    })
  })
  req.write(JSON.stringify(payload))
  req.end()
}
