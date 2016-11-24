import * as appProxy from '../ui/lib/app-proxy'

import { proxyRequest } from '../ui/main-process-proxy'

/** The HTTP payload sent by Electron's net module */
export interface IHTTPResponseNexus {
  /** The HTTP status code */
  statusCode: number | undefined,
  /** The key-value collection of headers associated with the response */
  headers: { },
  /** The deserialized JSON response body */
  body: { } | undefined
}

/** The HTTP methods available. */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'HEAD'

/** Resolve a given header on the HTTP response */
export function getHeader(response: IHTTPResponseNexus, key: string): string | null {
  const headers = <any>response.headers
  const header = headers[key]
  if (header) {
    // TODO: for now, we just give the first value
    const value: string = header[0]
    return value
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
export function request(endpoint: string, authorization: string | null, method: HTTPMethod, path: string, body: Object | null, customHeaders?: Object): Promise<IHTTPResponseNexus> {
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
  }

  let requestBody: string | undefined
  if (body) {
    requestBody = JSON.stringify(body)
  }

  return proxyRequest(options, requestBody)
}