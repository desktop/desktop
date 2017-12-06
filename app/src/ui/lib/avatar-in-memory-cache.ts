import * as crypto from 'crypto'

const inMemoryCache = new Map<string, string | null>()

function generateGravatarUrl(email: string): string {
  const input = email.trim().toLowerCase()
  const hash = crypto
    .createHash('md5')
    .update(input)
    .digest('hex')

  return `https://www.gravatar.com/avatar/${hash}?s=200`
}

const myHeaders = new Headers()

const defaultInit: RequestInit = {
  method: 'GET',
  headers: myHeaders,
  mode: 'cors',
  cache: 'default',
}

async function fetchAndCache(requestUrl: string) {
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

export async function fetchAvatar(
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
