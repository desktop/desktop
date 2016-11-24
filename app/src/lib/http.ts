/** The HTTP payload sent by Electron's net module */
export interface IHTTPResponseNexus {
  /** The HTTP status code */
  statusCode: number,
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