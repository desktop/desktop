import * as Path from 'path'
import { realpath } from 'fs/promises'
import { pathToFileURL } from 'url'

/**
 * Resolve and encode the path information into a URL.
 *
 * @param pathSegments array of path segments to resolve
 */
export const encodePathAsUrl = (...pathSegments: string[]) =>
  pathToFileURL(Path.resolve(...pathSegments)).toString()

/**
 * Resolve one or more path sequences into an absolute path underneath
 * or at the given root path.
 *
 * The path segments are expected to be relative paths although
 * providing an absolute path is also supported. In the case of an
 * absolute path segment this method will essentially only verify
 * that the absolute path is equal to or deeper in the directory
 * tree than the root path.
 *
 * If the fully resolved path does not reside underneath the root path
 * this method will return null.
 *
 * @param rootPath     The path to the root path. The resolved path
 *                     is guaranteed to reside at, or underneath this
 *                     path.
 * @param pathSegments One or more paths to join with the root path
 * @param options      A subset of the Path module. Requires join, resolve,
 *                     normalize, relative, and isAbsolute, plus the platform
 *                     separator. Defaults to the platform specific path
 *                     functions but can be overridden with Path.win32 or
 *                     Path.posix
 */
async function _resolveWithin(
  rootPath: string,
  pathSegments: string[],
  options: {
    join: (...pathSegments: string[]) => string
    normalize: (p: string) => string
    resolve: (...pathSegments: string[]) => string
    relative: (from: string, to: string) => string
    isAbsolute: (p: string) => boolean
    sep: string
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

  // Null bytes has no place in paths.
  if (
    normalizedRoot.indexOf('\0') !== -1 ||
    normalizedRelative.indexOf('\0') !== -1
  ) {
    return null
  }

  // Resolve to an absolute path. Note that this will not contain
  // any directory traversal segments.
  const resolved = resolve(normalizedRoot, normalizedRelative)

  const realRoot = await realpath(normalizedRoot)
  const realResolved = await realpath(resolved)

  // Compare path components, not string prefixes: /root-sibling is not
  // contained by /root even though its name begins with the same characters.
  const relativePath = options.relative(realRoot, realResolved)
  const isWithinRoot =
    relativePath === '' ||
    (!options.isAbsolute(relativePath) &&
      relativePath !== '..' &&
      !relativePath.startsWith(`..${options.sep}`))

  return isWithinRoot ? resolved : null
}

/**
 * Resolve one or more path sequences into an absolute path underneath
 * or at the given root path.
 *
 * The path segments are expected to be relative paths although
 * providing an absolute path is also supported. In the case of an
 * absolute path segment this method will essentially only verify
 * that the absolute path is equal to or deeper in the directory
 * tree than the root path.
 *
 * If the fully resolved path does not reside underneath the root path
 * this method will return null.
 *
 * This method will resolve paths using the current platform path
 * structure.
 *
 * @param rootPath     The path to the root path. The resolved path
 *                     is guaranteed to reside at, or underneath this
 *                     path.
 * @param pathSegments One or more paths to join with the root path
 */
export function resolveWithin(
  rootPath: string,
  ...pathSegments: string[]
): Promise<string | null> {
  return _resolveWithin(rootPath, pathSegments)
}

/**
 * Resolve one or more path sequences into an absolute path underneath
 * or at the given root path.
 *
 * The path segments are expected to be relative paths although
 * providing an absolute path is also supported. In the case of an
 * absolute path segment this method will essentially only verify
 * that the absolute path is equal to or deeper in the directory
 * tree than the root path.
 *
 * If the fully resolved path does not reside underneath the root path
 * this method will return null.
 *
 * This method will resolve paths using POSIX path syntax.
 *
 * @param rootPath     The path to the root path. The resolved path
 *                     is guaranteed to reside at, or underneath this
 *                     path.
 * @param pathSegments One or more paths to join with the root path
 */
export function resolveWithinPosix(
  rootPath: string,
  ...pathSegments: string[]
): Promise<string | null> {
  return _resolveWithin(rootPath, pathSegments, Path.posix)
}

/**
 * Resolve one or more path sequences into an absolute path underneath
 * or at the given root path.
 *
 * The path segments are expected to be relative paths although
 * providing an absolute path is also supported. In the case of an
 * absolute path segment this method will essentially only verify
 * that the absolute path is equal to or deeper in the directory
 * tree than the root path.
 *
 * If the fully resolved path does not reside underneath the root path
 * this method will return null.
 *
 * This method will resolve paths using Windows path syntax.
 *
 * @param rootPath     The path to the root path. The resolved path
 *                     is guaranteed to reside at, or underneath this
 *                     path.
 * @param pathSegments One or more paths to join with the root path
 */
export function resolveWithinWin32(
  rootPath: string,
  ...pathSegments: string[]
): Promise<string | null> {
  return _resolveWithin(rootPath, pathSegments, Path.win32)
}

export const win32 = {
  resolveWithin: resolveWithinWin32,
}

export const posix = {
  resolveWithin: resolveWithinPosix,
}
