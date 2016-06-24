import send from './send'

export const console = {
  log: (...args: any[]) => {
    send('console/log', {args})
  },
  error: (...args: any[]) => {
    send('console/error', {args})
  }
}

export function getUsers() {
  return send('state/get', [])
}

export function ping(): Promise<string> {
  return send('ping', [])
}
