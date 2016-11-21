import * as URL from 'url'

/** The protocols over which we can connect to Enterprise instances. */
const AllowedProtocols = new Set([
  'https:',
  'http:',
])

/**
 * Validate the URL for a GitHub Enterprise instance.
 *
 * Returns the validated URL, or throws if the URL cannot be validated.
 */
export function validateURL(address: string): string {
  let url = URL.parse(address)
  if (!url.host) {
    // E.g., if they user entered 'ghe.io', let's assume they're using https.
    address = `https://${address}`
    url = URL.parse(address)
  }

  if (!url.protocol) {
    throw new Error('Invalid URL')
  }

  if (!AllowedProtocols.has(url.protocol)) {
    throw new Error('Invalid protocol')
  }

  return address
}
