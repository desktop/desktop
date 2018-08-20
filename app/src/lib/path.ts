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

function _resolveWithin(
  rootPath: string,
  pathSegments: string[],
  options: {
    join: (...pathSegments: string[]) => string
    normalize: (p: string) => string
    resolve: (...pathSegments: string[]) => string
  } = Path
) {
  // An empty root path would let all relative
  // paths through.
  if (rootPath.length === 0) {
    return null
  }

  const { join, normalize, resolve } = options

  const normalizedRoot = normalize(rootPath)
  const normalizedRelative = normalize(join(...pathSegments))

  // Resolve to an absolute path. Note that this will not contain
  // any directory traversal segments.
  const resolved = resolve(normalizedRoot, normalizedRelative)

  if (!resolved.startsWith(normalizedRoot)) {
    return null
  }

  // Null bytes has no place in paths.
  if (resolved.indexOf('\0') !== -1) {
    return null
  }

  return resolved
}

export function resolveWithin(
  rootPath: string,
  ...pathSegments: string[]
): string | null {
  return _resolveWithin(rootPath, pathSegments)
}

export function resolveWithinPosix(
  rootPath: string,
  ...pathSegments: string[]
): string | null {
  return _resolveWithin(rootPath, pathSegments, Path.posix)
}

export function resolveWithinWin32(
  rootPath: string,
  ...pathSegments: string[]
): string | null {
  return _resolveWithin(rootPath, pathSegments, Path.win32)
}

export const win32 = {
  resolveWithin: resolveWithinWin32,
}

export const posix = {
  resolveWithin: resolveWithinPosix,
}
