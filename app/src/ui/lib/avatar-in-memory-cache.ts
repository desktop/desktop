import * as crypto from 'crypto'

const inMemoryCache = new Map<string, string>()

function generateGravatarUrl(email: string): string {
  const input = email.trim().toLowerCase()
  const hash = crypto
    .createHash('md5')
    .update(input)
    .digest('hex')

  return `https://www.gravatar.com/avatar/${hash}?s=200`
}

async function convertResponseToDataUrl(response: Response): Promise<string> {
  const blob = await response.blob()
  const objectURL = URL.createObjectURL(blob)
  return objectURL
}

const myHeaders = new Headers()

const defaultInit: RequestInit = {
  method: 'GET',
  headers: myHeaders,
  mode: 'cors',
  cache: 'default',
}

export async function fetchAvatar(
  avatarURL: string,
  email: string
): Promise<string | null> {
  // first off, let's try and fetch their account avatar
  const cachedAccountAvatar = inMemoryCache.get(avatarURL)
  if (cachedAccountAvatar) {
    return cachedAccountAvatar
  }

  try {
    const avatarResponse = await fetch(avatarURL, defaultInit)
    if (avatarResponse.ok) {
      const url = await convertResponseToDataUrl(avatarResponse)
      inMemoryCache.set(avatarURL, url)
      return url
    }
  } catch {
    // ignore any potential network errors
  }

  // if that doesn't work, let's use their email address to generate a Gravatar
  // URL and try to resolve that

  const gravatarURL = generateGravatarUrl(email)

  const cachedGravatarAvatar = inMemoryCache.get(gravatarURL)
  if (cachedGravatarAvatar) {
    return cachedGravatarAvatar
  }

  try {
    const gravatarResponse = await fetch(gravatarURL, defaultInit)
    if (gravatarResponse.ok) {
      const url = await convertResponseToDataUrl(gravatarResponse)
      inMemoryCache.set(gravatarURL, url)
      return url
    }
  } catch {
    // ignore any potential network errors
  }

  return null
}
