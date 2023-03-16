import { randomBytes } from 'crypto'

/**
 * Generate a pseudo-random sequence of hexadecimal values for use in testing.
 *
 * Source: https://blog.abelotech.com/posts/generate-random-values-nodejs-javascript/
 */
export function generateString(length: number = 32) {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex') // convert to hexadecimal format
    .slice(0, length) // return required number of characters
}
