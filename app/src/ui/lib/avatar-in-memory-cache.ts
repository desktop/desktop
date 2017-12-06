import * as crypto from 'crypto'

import { IAvatarUser } from '../../models/avatar'

const inMemoryCache = new Map<string, string | null>()

/**
 * Convert an email address to a Gravatar URL
 *
 * @param email The email address associated with a user
 * @param size The size (in pixels) of the avatar to render
 */
function generateGravatarUrl(email: string, size: number = 200): string {
  const input = email.trim().toLowerCase()
  const hash = crypto
    .createHash('md5')
    .update(input)
    .digest('hex')

  return `https://www.gravatar.com/avatar/${hash}?s=${size}`
}

const defaultHeaders = new Headers()

const defaultInit: RequestInit = {
  method: 'GET',
  headers: defaultHeaders,
  mode: 'cors',
  cache: 'default',
}

/**
 * Fetch an avatar URL and cache it in memory, using the browser's
 * URL.createObjectURL represent the local image blob.
 *
 * @param requestUrl The source URL to fetch
 */
async function fetchAndCache(requestUrl: string): Promise<string | null> {
  let url: string | null = null

  try {
    const response = await fetch(requestUrl, defaultInit)
    if (response.ok) {
      const blob = await response.blob()
      url = URL.createObjectURL(blob)
    }
  } catch {
    // catch and ignore any network errors
  }

  inMemoryCache.set(requestUrl, url)

  return url
}

/**
 * Fetch an avatar associated to associate with a user, using graceful fallback
 * when the resource is not accessible.
 *
 * @param avatarURL The GitHub avatar URL to try first
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
