import { createHash } from 'crypto'
import { createReadStream } from 'fs'

/**
 * Calculates the hex encoded hash digest of a given file on disk.
 */
export const getFileHash = (path: string, type: 'sha1' | 'sha256') =>
  new Promise<string>((resolve, reject) => {
    const hash = createHash(type)

    hash.on('finish', () => resolve(hash.digest('hex')))
    hash.on('error', reject)

    createReadStream(path).on('error', reject).pipe(hash)
  })
