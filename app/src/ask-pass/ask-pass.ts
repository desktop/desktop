import { getKeyForEndpoint } from '../lib/auth'
import * as TokenStore from '../shared-process/token-store'

/** Parse the GIT_ASKPASS prompt and determine the appropriate response. */
export async function responseForPrompt(prompt: string): Promise<string | null> {
  const username: string | null = process.env.DESKTOP_USERNAME
  if (!username || !username.length) { return null }

  if (prompt.startsWith('Username')) {
    return username
  } else if (prompt.startsWith('Password')) {
    const endpoint: string | null = process.env.DESKTOP_ENDPOINT
    if (!endpoint || !endpoint.length) { return null }

    const key = getKeyForEndpoint(endpoint)
    return await TokenStore.getItem(key, username)
  }

  return null
}
