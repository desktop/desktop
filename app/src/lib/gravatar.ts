import * as crypto from 'crypto'

/**
 * Convert an email address to a Gravatar URL format
 *
 * @param email The email address associated with a user
 * @param size The size (in pixels) of the avatar to render
 */
export function generateGravatarUrl(email: string, size: number = 60): string {
  const input = email.trim().toLowerCase()
  const hash = crypto.createHash('md5').update(input).digest('hex')

  return `https://www.gravatar.com/avatar/${hash}?s=${size}`
}
