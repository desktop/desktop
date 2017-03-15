import * as URL from 'url'

/** The protocols over which we can connect to Enterprise instances. */
const AllowedProtocols = new Set([
  'https:',
  'http:',
])

/** The name for errors thrown because of an invalid URL. */
export const InvalidURLErrorName = 'invalid-url'

/** The name for errors thrown because of an invalid protocol. */
export const InvalidProtocolErrorName = 'invalid-protocol'

/**
 * Validate the URL for a GitHub Enterprise instance.
 *
 * Returns the validated URL, or throws if the URL cannot be validated.
 */
export function validateURL(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length === 0) {
    const error = new Error('Unknown address')
    error.name = InvalidURLErrorName
    throw error
  }

  let url = URL.parse(trimmed)
  if (!url.host) {
    // E.g., if they user entered 'ghe.io', let's assume they're using https.
    address = `https://${trimmed}`
    url = URL.parse(address)
  }

  if (!url.protocol) {
    const error = new Error('Invalid URL')
    error.name = InvalidURLErrorName
    throw error
  }

  if (!AllowedProtocols.has(url.protocol)) {
    const error = new Error('Invalid protocol')
    error.name = InvalidProtocolErrorName
    throw error
  }

  return address
}
