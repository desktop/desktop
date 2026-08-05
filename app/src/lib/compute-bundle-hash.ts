import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { getFileHash } from './get-file-hash'
import * as path from 'path'

/**
 * The bundle files whose integrity we verify. Any modification to these files
 * could cause crashes or error reports, so we include all of them in the
 * combined hash. In practice, renderer.js and main.js are by far the most
 * likely targets for user modification (e.g., translating UI strings).
 *
 * Not included: CSS files (renderer.css, crash.css in production builds),
 * native modules (.node), node_modules, and static assets (SVGs, emoji).
 * While corrupted native modules could produce JS errors, these files are not
 * typical targets for intentional user modification.
 */
export const bundleFiles = [
  'main.js',
  'renderer.js',
  'crash.js',
  'highlighter.js',
  'cli.js',
  'index.html',
  'crash.html',
]

/**
 * Compute a combined SHA-256 hash representing the integrity of all shipped
 * bundle files in the given directory.
 *
 * The combined hash is a Merkle-style construction: individual file hashes are
 * computed, concatenated in a fixed order, and then hashed again. This produces
 * a single deterministic value that changes if any bundle is modified.
 */
export async function computeBundleHash(bundleDir: string): Promise<string> {
  const hashes = await Promise.all(
    bundleFiles.map(f => getFileHash(path.join(bundleDir, f), 'sha256'))
  )
  return createHash('sha256').update(hashes.join('')).digest('hex')
}

/** Synchronous variant for use in build scripts where async is not available. */
export function computeBundleHashSync(bundleDir: string): string {
  const hashes = bundleFiles.map(f => {
    const content = readFileSync(path.join(bundleDir, f))
    return createHash('sha256').update(content).digest('hex')
  })
  return createHash('sha256').update(hashes.join('')).digest('hex')
}
