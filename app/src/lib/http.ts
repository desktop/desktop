import * as URL from 'url'
import * as appProxy from '../ui/lib/app-proxy'

import { proxyRequest } from '../ui/main-process-proxy'

/** The HTTP payload returned by Electron's net module */
export interface IHTTPResponse {
  /** The HTTP status code */
  readonly statusCode?: number,
  /** The key-value collection of headers associated with the response */
  readonly headers?: { [key: string]: any; },
  /** The response body */
  readonly body?: string
  /** An error if one occurred. */
  readonly error?: Error
}

/** The HTTP request to map to Electron's net module */
export interface IHTTPRequest {
  /** The resource to access */
  readonly url: string,
  /** The verb associated with the request */
  readonly method: HTTPMethod,
  /** The key-value collection of headers associated with the request */
  readonly headers?: { [key: string]: any; },
  /** The request object to serialize */
  readonly body?: Object
}

/** The HTTP methods available. */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'HEAD'

type IAdditionalParameters = {
  [key: string]: string | Date
}

/** Options to provide when making API requests */
export interface IGitHubAPIOptions {
  /** Additional arguments to provide to the URL */
  readonly params?: IAdditionalParameters
  /** The server instance to interact with */
  readonly endpoint: string
  /** The user token to set to the Authorization header */
  readonly token: string
}

/** Resolve a given header on the HTTP response */
export function getHeader(response: IHTTPResponse, key: string): string | null {
  if (!response.headers) {
    return null
  }

  const keyUpper = key.toUpperCase()

  for (const k in response.headers) {
    const key = k.toUpperCase()

    if (key === keyUpper) {
      const header = response.headers[k]
      if (header) {
        // `net` module returns an array for each header, so to keep things
        // simple we are currently just returning the first value.
        // Discussion about changing this behaviour to match the Node HTTP API:
        // https://github.com/electron/electron/issues/8117
        const value: string = header[0]
        return value
      }
      return null
    }
  }

  return null
}

type LinkHeaders = {
  readonly first?: string,
  readonly prev?: string,
  readonly next?: string,
  readonly last?: string,
}

/**
 * Read the pagination headers from the HTTP response.
 *
 * For more information: https://developer.github.com/v3/#pagination
 */
export function getLinkHeaders(response: IHTTPResponse): LinkHeaders {
  const linkHeader = getHeader(response, 'link')

  if (!linkHeader) { return { } }

  let first, prev, next, last: string | undefined = undefined

  // looking for the comma-separated values inside the Link header
  // for example:
  // Link: <https://api.github.com/user/repos?page=3&per_page=100>; rel="next",
  //  <https://api.github.com/user/repos?page=50&per_page=100>; rel="last"
  const linkHeaderRegex = /\<([a-z0-9\=\_\&\?\/\.\:]*)\>; rel=\"(first|prev|next|last)\"/g

  let matches = linkHeaderRegex.exec(linkHeader)

  while (matches) {
    for (let i = 1; i < matches.length; i += 2) {
      const url = matches[i]
      const type = matches[i + 1]
      if (type === 'first') {
        const result = URL.parse(url)
        if (result) {
          first = result.path
        }
      } else if (type === 'prev') {
        const result = URL.parse(url)
        if (result) {
          prev = result.path
        }
      } else if (type === 'next') {
        const result = URL.parse(url)
        if (result) {
          next = result.path
        }
      } else if (type === 'last') {
        const result = URL.parse(url)
        if (result) {
          last = result.path
        }
      }
    }
    matches = linkHeaderRegex.exec(linkHeader)
  }

  return { first, prev, next, last }
}

/**
 * Convert a JSON object to a URI-encoded querystring
 *
 * Note: does not handle arrays or nested objects
 */
export function toQueryString(object: IAdditionalParameters): string {
  // citation: http://stackoverflow.com/a/30707423/1363815
  return '?' +

    Object.keys(object).map(function (key) {
      const value: any = object[key]

      if (value instanceof Date) {
        // timestamp fields such as `since` and `before` are
        // expected to be formatted in the raw ISO-8601 format
        // (YYYY-MM-DDTHH:MM:SSZ) and must not be URI-encoded,
        // otherwise this will format the : and - characters
        return `${key}=${value.toISOString()}`
      } else {
        return encodeURIComponent(key) + '=' +
          encodeURIComponent(value)
      }
    }).join('&')
}

/**
 * Lookup the link headers on the HTTP response to see whether there are
 * further resources to retrieve.
 *
 * Removes the host information, as the API client tracks this information.
 */
function resolveNextPath(response: IHTTPResponse): string | null {
  const linkHeader = getLinkHeaders(response)
  if (!linkHeader.next) {
    return null
  }

  const nextPath = linkHeader.next
  if (nextPath) {
    if (nextPath.startsWith('/')) {
      // URL builder will specify this, let's drop it here
      return nextPath.substr(1)
    }
    return nextPath
  }

  return null
}

/**
 * Deserialize the HTTP response body into an expected object shape
 *
 * Note: this doesn't validate the expected shape, and will only fail
 * if it encounters invalid JSON
 */
export function deserialize<T>(body: string | undefined): T | null {
  if (!body) {
    return null
  }

  try {
    return JSON.parse(body) as T
  } catch (e) {
    console.error('Unable to deserialize JSON string to object', e)
    return null
  }
}

/**
 * Detect the encoding associated with the HTTP response.
 *
 * If not specified in the response headers, null is returned.
 */
export function getContentType(response: IHTTPResponse): string | null {
  const contentType = getHeader(response, 'Content-Type')
  if (!contentType) {
    return null
  }

  // example `Content-Type: text/html; charset=utf-8`
  const tokens = contentType.split(';')
  if (tokens.length > 0) {
    return tokens[0]
  }

  return null
}

/**
 * Detect the character encoding associated with the HTTP response.
 *
 * If not found, for `text/*` or `application/json` assumes `'ISO-8859-1'`.
 * Otherwise returns `null`
 */
export function getEncoding(response: IHTTPResponse): string | null {
  const contentType = getContentType(response)
  if (!contentType) {
    return null
  }

  // example `Content-Type: text/html; charset=utf-8`
  const contentTypeRaw = getHeader(response, 'Content-Type')

  // we've checked above for the existence of this header, but we
  // can't reuse that value here because it strips the optional
  // key-value parameters that we need here to find `charset`
  const tokens = contentTypeRaw!.split(';')

  // in theory there could be multiple `;` values here, but
  // we're really expecting one `;` here to separate the
  // value of `Content-Type` from the optional list of key-value
  // parameters that may be provided afterwards
  if (tokens.length >= 2) {
    for (let i = 1; i < tokens.length; i++) {
      const values = tokens[i].split('=')
      if (values.length === 2 && values[0].trim() === 'charset') {
        return values[1]
      }
    }
  }

  // while we expect JSON endpoints to return a charset, we might
  // have some scenarios where this is not the case
  // see http://www.iana.org/assignments/media-types/application/json
  // for more information
  if (contentType === 'application/json') {
    return 'utf-8'
  }

  // RFC2616 states that text-based media subtypes without an
  // explicit charset should be considered ISO-8859-1
  if (contentType.startsWith('text/')) {
    return 'iso-8859-1'
  }

  return null
}

/**
 * Make an API request.
 *
 * @param endpoint      - The API endpoint.
 * @param authorization - The value to pass in the `Authorization` header.
 * @param method        - The HTTP method.
 * @param path          - The path without a leading /.
 * @param body          - The body to send.
 * @param customHeaders - Any optional additional headers to send.
 */
export function request(endpoint: string, authorization: string | null, method: HTTPMethod, path: string, body?: Object, customHeaders?: Object): Promise<IHTTPResponse> {
  const url = `${endpoint}/${path}`
  const headers: any = Object.assign({}, {
    'Accept': 'application/vnd.github.v3+json, application/json',
    'Content-Type': 'application/json',
    'User-Agent': `${appProxy.getName()}/${appProxy.getVersion()}`,
  }, customHeaders)

  if (authorization) {
    headers['Authorization'] = authorization
  }

  const options = {
    url,
    headers,
    method,
    body,
  }

  return proxyRequest(options)
}

/**
 * Verify a HTTP response is in the accepted range.
 *
 * Returns true if the status code is in the 2XX range.  Returns false otherwise.
 */
function isSuccess(statusCode: number | undefined): boolean {
  if (!statusCode) {
    return false
  }
  return statusCode >= 200 && statusCode <= 299
}

function resolveUrl(basePath: string, params?: IAdditionalParameters): string {
  if (basePath.startsWith('/')) {
    throw new Error('Path must not start with a leading slash.')
  }

  if (basePath.indexOf('?') > -1) {
    throw new Error('Base path must not contain query string parameters. Use `options.params` to provide these.')
  }

  return params ? `${basePath}${toQueryString(params)}` : basePath
}

/**
 * Execute a HTTP POST request against a given resource, and deserialize it to a given shape.
 *
 * @returns a promise which resolves to the deserialized object if the response is successful, or a rejected promise otherwise.
 */
export async function post<T>(basePath: string, body: Object, options: IGitHubAPIOptions): Promise<T | null> {
  const path = resolveUrl(basePath, options.params)
  const response = await request(options.endpoint, `token ${options.token}`, 'POST', path, body)

  if (isSuccess(response.statusCode)) {
    return deserialize<T>(response.body)
  } else {
    throw new Error(`Could not complete request successfully. Status code ${response.statusCode} received.`)
  }
}

/**
 * Execute a HTTP GET request against a given resource, and deserialize it to a given shape.
 *
 * @returns a promise which resolves to the deserialized object if the response is successful, or a rejected promise otherwise.
 */
export async function get<T>(path: string, options: IGitHubAPIOptions): Promise<T | null> {
  const currentPath = resolveUrl(path, options.params)
  const response = await request(options.endpoint, `token ${options.token}`, 'GET', currentPath)

  if (isSuccess(response.statusCode)) {
    return deserialize<T>(response.body)
  } else {
    throw new Error(`Could not complete request successfully. Status code ${response.statusCode} received.`)
  }
}

/**
 * Execute a HTTP GET request against a given resource, and deserialize it to an array of objects.
 *
 * @returns a promise which resolves to the deserialized list of objects if the response is successful, or an empty array otherwise.
 */
export async function getAllPages<T>(path: string, options: IGitHubAPIOptions): Promise<ReadonlyArray<T>> {
  const allItems = new Array<T>()
  const params = { ...{ per_page: '100' }, ...options.params }

  let currentPath: string | null = `${path}${toQueryString(params)}`

  do {
    const response = await request(options.endpoint, `token ${options.token}`, 'GET', currentPath)

    if (!isSuccess(response.statusCode)) {
      currentPath = null
      break
    }

    const issues = deserialize<T[]>(response.body)

    if (issues) {
      allItems.push(...issues)
    }

    currentPath = resolveNextPath(response)
  } while (currentPath !== null)

  return allItems
}
