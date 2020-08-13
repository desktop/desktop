import { randomBytes as nodeCryptoGetRandomBytes } from 'crypto'
import guid from 'uuid/v4'

/**
 * Fills a buffer with the required number of random bytes.
 *
 * Attempt to use the Chromium-provided crypto library rather than
 * Node.JS. For some reason the Node.JS randomBytes function adds
 * _considerable_ (1s+) synchronous load time to the start up.
 *
 * See
 *  https://developer.mozilla.org/en-US/docs/Web/API/Window/crypto
 *  https://github.com/kelektiv/node-uuid/issues/189
 */
function getRandomBytes(count: number) {
  if (window.crypto) {
    const rndBuf = new Uint8Array(count)
    crypto.getRandomValues(rndBuf)

    return rndBuf
  }

  return nodeCryptoGetRandomBytes(count)
}

/**
 * Wrapper function over uuid's v4 method that attempts to source
 * entropy using the window Crypto instance rather than through
 * Node.JS.
 */
export function uuid() {
  return guid({ random: getRandomBytes(16) })
}
