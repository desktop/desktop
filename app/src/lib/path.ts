import * as Path from 'path'
import fileUrl = require('file-url')

/**
 * Resolve and encode the path information into a URL.
 *
 * @param pathSegments array of path segments to resolve
 */
export function encodePathAsUrl(...pathSegments: string[]): string {
  const path = Path.resolve(...pathSegments)
  return fileUrl(path)
}

export function resolveWithin(
  rootPath: string,
  ...pathSegments: string[]
): string | null {
  // An empty root path would let all relative
  // paths through.
  if (rootPath.length === 0) {
    return null
  }

  const normalizedRoot = Path.normalize(rootPath)
  const normalizedRelative = Path.normalize(Path.join(...pathSegments))

  // Resolve to an absolute path. Note that this will not contain
  // any directory traversal segments.
  const resolved = Path.resolve(normalizedRoot, normalizedRelative)

  if (!resolved.startsWith(normalizedRoot)) {
    return null
  }

  // Null bytes has no place in paths.
  if (resolved.indexOf('\0') !== -1) {
    return null
  }

  return resolved
}
