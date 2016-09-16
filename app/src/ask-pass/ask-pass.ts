import { getKeyForEndpoint } from '../lib/auth'
import tokenStore from '../shared-process/token-store'

/** Parse the GIT_ASKPASS prompt and determine the appropriate response. */
export function responseForPrompt(prompt: string): string | null {
  const fs = require('fs')
  fs.appendFileSync('C:\\Users\\joshaber\\Desktop\\out.txt', `ASKPASS\r\nprompt: ${prompt}\r\n`, 'utf8')
  const username: string | null = process.env.DESKTOP_USERNAME
  fs.appendFileSync('C:\\Users\\joshaber\\Desktop\\out.txt', `username: ${username}\r\n`, 'utf8')
  fs.appendFileSync('C:\\Users\\joshaber\\Desktop\\out.txt', `${JSON.stringify(process.env)}\r\n`, 'utf8')
  if (!username || !username.length) { return null }

  if (prompt.startsWith('Username')) {
    return username
  } else if (prompt.startsWith('Password')) {
    const endpoint: string | null = process.env.DESKTOP_ENDPOINT
    if (!endpoint || !endpoint.length) { return null }

    const key = getKeyForEndpoint(endpoint)
    const token = tokenStore.getItem(key, username)
    return token
  }

  return null
}
