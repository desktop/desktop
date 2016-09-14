import { getKeyForEndpoint } from '../lib/auth'
import tokenStore from '../shared-process/token-store'

/** Parse the GIT_ASKPASS prompt and determine the appropriate response. */
export function responseForPrompt(prompt: string): string | null {
  const username = process.env.DESKTOP_USERNAME
  if (prompt.startsWith('Username')) {
    return username
  } else if (prompt.startsWith('Password')) {
    const endpoint = process.env.DESKTOP_ENDPOINT
    const key = getKeyForEndpoint(endpoint)
    const token = tokenStore.getItem(key, username)
    return token
  }

  return null
}
