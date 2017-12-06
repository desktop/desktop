import { generateGravatarUrl } from '../../lib/gravatar'
import { IAvatarUser } from '../../models/avatar'

const inMemoryCache = new Map<string, string | null>()

const defaultHeaders = new Headers()

const defaultInit: RequestInit = {
  method: 'GET',
  headers: defaultHeaders,
  mode: 'cors',
  cache: 'default',
}

/**
 * Fetch an avatar URL and cache it in memory, using the browser's
 * URL.createObjectURL method to refer to the blob content, instead of
 * converting into the data URI format.
 *
 * This method will store a `null` in the cache if the request fails, so that
 * it avoids repeated requests to the same URL for the current session.
 *
 * @param requestUrl The source URL to fetch
 */
async function fetchAndCache(requestUrl: string): Promise<string | null> {
  let url: string | null = null

  try {
    const response = await fetch(requestUrl, defaultInit)
    if (response.ok) {
      const contentType = response.headers.get('Content-Type')
      if (contentType && contentType.startsWith('text/html')) {
        // we're encountering a request to sign in, let's skip this
      } else {
        const blob = await response.blob()
        url = URL.createObjectURL(blob)
      }
    }
  } catch {
    // catch and ignore any network errors
  }

  inMemoryCache.set(requestUrl, url)

  return url
}

/**
 * Fetch an avatar to associate with a user, with fallback when the resource is
 * not accessible.
 *
 * @param avatarURL The GitHub avatar URL to lookup first
 * @param email The email address to translate into a Gravatar URL as a fallback
 */
export async function lookupAvatar(
  avatarURL: string,
  email: string
): Promise<string | null> {
  const cachedAccountAvatar = inMemoryCache.get(avatarURL)
  if (cachedAccountAvatar) {
    return cachedAccountAvatar
  }

  if (cachedAccountAvatar === undefined) {
    // no cache entry found for GitHub avatar
    const accountAvatar = await fetchAndCache(avatarURL)
    if (accountAvatar) {
      return accountAvatar
    }
  }

  const gravatarURL = generateGravatarUrl(email)
  const cachedGravatarAvatar = inMemoryCache.get(gravatarURL)
  if (cachedGravatarAvatar) {
    return cachedGravatarAvatar
  }

  if (cachedGravatarAvatar === undefined) {
    // no cache entry found for Gravatar avatar
    const gravatarAvatar = await fetchAndCache(gravatarURL)
    if (gravatarAvatar) {
      return gravatarAvatar
    }
  }

  return null
}

/**
 * Fetch the avatar associated with the current user
 *
 * @param defaultURL default avatar to render
 * @param user current user to inspect
 */
export async function fetchAvatarUrl(
  defaultURL: string,
  user?: IAvatarUser
): Promise<string> {
  if (!user) {
    return defaultURL
  }

  const avatar = await lookupAvatar(user.avatarURL, user.email)
  return avatar || defaultURL
}
