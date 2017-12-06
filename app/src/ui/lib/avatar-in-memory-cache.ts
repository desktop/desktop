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
  // first, lookup a cached value for the avatar
  const cachedAccountAvatar = inMemoryCache.get(avatarURL)
  if (cachedAccountAvatar !== undefined) {
    return cachedAccountAvatar
  }

  const accountAvatar = await fetchAndCache(avatarURL)
  if (accountAvatar) {
    return accountAvatar
  }

  // if that doesn't work, let's use their email address to generate a Gravatar
  // URL and try to resolve that

  const gravatarURL = generateGravatarUrl(email)
  const cachedGravatarAvatar = inMemoryCache.get(gravatarURL)
  if (cachedGravatarAvatar) {
    return cachedGravatarAvatar
  }

  const gravatarAvatar = await fetchAndCache(gravatarURL)
  if (gravatarAvatar) {
    return gravatarAvatar
  }

  return null
}
