import * as appProxy from '../ui/lib/app-proxy'

import { proxyRequest } from '../ui/main-process-proxy'

/** The HTTP payload returned by Electron's net module */
export interface IHTTPResponse {
  /** The HTTP status code */
  readonly statusCode?: number,
  /** The key-value collection of headers associated with the response */
  readonly headers?: { [key: string]: any; },
  /** The deserialized JSON response body */
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

export function deserialize<T>(body: string | undefined): T | null {
  if (!body) {
    return null
  }

  try {
    return JSON.parse(body) as T
  } catch (e) {
    console.error(`Unable to deserialize JSOn string to object`)
    console.error(e)
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

  const contentTypeRaw = getHeader(response, 'Content-Type')

  // example `Content-Type: text/html; charset=utf-8`
  const tokens = contentTypeRaw!.split(';')
  if (tokens.length >= 2) {
    // iterate over any optional parameters after the content-type
    for (let i = 1; i < tokens.length; i++) {
      const values = tokens[i].split('=')
      if (values.length === 2 && values[0].trim() === 'charset') {
        return values[1]
      }
    }
  }

  // as a fallback, look for specific text-based types
  if (contentType === 'appplication/json' || contentType.startsWith('text/')) {
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
