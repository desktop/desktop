import * as appProxy from '../ui/lib/app-proxy'

/** The HTTP methods available. */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'HEAD'

/**
 * Deserialize the HTTP response body into an expected object shape
 *
 * Note: this doesn't validate the expected shape, and will only fail
 * if it encounters invalid JSON
 */
export async function deserialize<T>(response: Response): Promise<T | null> {
  try {
    const json = await response.json()
    return json as T
  } catch (e) {
    console.error('Unable to deserialize JSON string to object', e, response)
    return null
  }
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
export function request(endpoint: string, authorization: string | null, method: HTTPMethod, path: string, body?: Object, customHeaders?: Object): Promise<Response> {
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
    headers,
    method,
    body: JSON.stringify(body),
  }

  return fetch(url, options)
}
