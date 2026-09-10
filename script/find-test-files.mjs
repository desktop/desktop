import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Discover both application `-test` files and custom ESLint `.test` files.
 *
 * @param {ReadonlyArray<string>} paths
 * @returns {Promise<string[]>}
 */
export async function findTestFilesIn(paths) {
  const files = []
  for (const path of paths) {
    const entry = await stat(path)
    if (entry.isFile()) {
      files.push(path)
      continue
    }

    for (const file of await readdir(path, { recursive: true })) {
      if (/(?:-test|\.test)\.(ts|tsx|js|jsx|mts|mjs)$/.test(file)) {
        files.push(join(path, file))
      }
    }
  }
  return files
}
