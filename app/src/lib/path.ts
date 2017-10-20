import * as Path from 'path'
import * as Url from 'url'

/**
 * Resolve and encode the path information into a URL.
 *
 * @param pathSegments array of path segments to resolve
 */
export function encodePathAsUrl(...pathSegments: string[]): string {
  const path = Path.resolve(...pathSegments)
  return Url.format({
    pathname: path,
    protocol: 'file:',
    slashes: true,
  })
}
