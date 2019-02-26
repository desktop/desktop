import * as crypto from 'crypto'

import { getDotComAPIEndpoint } from './api'

/**
 * Convert an email address to a Gravatar URL format
 *
 * @param email The email address associated with a user
 * @param size The size (in pixels) of the avatar to render
 */
export function generateGravatarUrl(email: string, size: number = 60): string {
  const input = email.trim().toLowerCase()
  const hash = crypto
    .createHash('md5')
    .update(input)
    .digest('hex')

  return `https://www.gravatar.com/avatar/${hash}?s=${size}`
}

/**
 * Retrieve the avatar for the given author, based on the
 * endpoint associated with an account.
 *
 * This is a workaround for a current limitation with
 * GitHub Enterprise, where avatar URLs are inaccessible
 * in some scenarios.
 *
 * @param avatar_url The canonical avatar to use
 * @param email The email address to use as a fallback
 * @param endpoint The API endpoint for the account
 */
export function getAvatarWithEnterpriseFallback(
  avatar_url: string,
  email: string | null,
  endpoint: string
): string {
  if (
    endpoint === getDotComAPIEndpoint() ||
    email === null ||
    email.length === 0
  ) {
    return avatar_url
  }

  return generateGravatarUrl(email)
}
