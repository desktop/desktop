import * as app from '../ui/lib/app'

export function reportError(error: Error) {
  debugger

  const payload = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    version: app.getVersion(),
  }
  console.log(payload)
}
