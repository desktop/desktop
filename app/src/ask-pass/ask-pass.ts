import { getKeyForEndpoint } from '../lib/auth'
import { TokenStore } from '../lib/stores/token-store'

import { appendToAskPassLog } from './logger'

/** Parse the GIT_ASKPASS prompt and determine the appropriate response. */
export async function responseForPrompt(
  prompt: string
): Promise<string | null> {
  const username: string | null = process.env.DESKTOP_USERNAME
  if (!username || !username.length) {
    appendToAskPassLog(`username '${username}' is not valid`)
    return null
  }

  if (prompt.startsWith('Username')) {
    return username
  } else if (prompt.startsWith('Password')) {
    const endpoint: string | null = process.env.DESKTOP_ENDPOINT
    if (!endpoint || !endpoint.length) {
      appendToAskPassLog(`endpoint '${endpoint}' is not valid`)
      return null
    }

    const key = getKeyForEndpoint(endpoint)
    appendToAskPassLog(`using key '${key}' to find token`)
    const token = await TokenStore.getItem(key, username)
    if (!token || !token.length) {
      appendToAskPassLog(`token '${token}' is not what we expected`)
    }
    return token
  }

  appendToAskPassLog(`prompt '${prompt}' was unhandled`)
  return null
}
