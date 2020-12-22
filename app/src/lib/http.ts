import * as appProxy from '../ui/lib/app-proxy'
import { URL } from 'url'

/** The HTTP methods available. */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'HEAD'

/**
 * The structure of error messages returned from the GitHub API.
 *
 * Details: https://developer.github.com/v3/#client-errors
 */
export interface IError {
  readonly message: string
  readonly resource: string
  readonly field: string
}

/**
 * The partial server response when an error has been returned.
 *
 * Details: https://developer.github.com/v3/#client-errors
 */
export interface IAPIError {
  readonly errors?: IError[]
  readonly message?: string
}

/** An error from getting an unexpected response to an API call. */
export class APIError extends Error {
  /** The error as sent from the API, if one could be parsed. */
  public readonly apiError: IAPIError | null

  /** The HTTP response code that the error was delivered with */
  public readonly responseStatus: number

  public constructor(response: Response, apiError: IAPIError | null) {
    let message
    if (apiError && apiError.message) {
      message = apiError.message

      const errors = apiError.errors
      const additionalMessages = errors && errors.map(e => e.message).join(', ')
      if (additionalMessages) {
        message = `${message} (${additionalMessages})`
      }
    } else {
      message = `API error ${response.url}: ${response.statusText} (${response.status})`
    }

    super(message)

    this.responseStatus = response.status
    this.apiError = apiError
  }
}

/**
 * Deserialize the HTTP response body into an expected object shape
 *
 * Note: this doesn't validate the expected shape, and will only fail if it
 * encounters invalid JSON.
 */
async function deserialize<T>(response: Response): Promise<T> {
  try {
    const json = await response.json()
    return json as T
  } catch (e) {
    const contentLength = response.headers.get('Content-Length') || '(missing)'
    const requestId = response.headers.get('X-GitHub-Request-Id') || '(missing)'
    log.warn(
      `deserialize: invalid JSON found at '${response.url}' - status: ${response.status}, length: '${contentLength}' id: '${requestId}'`,
      e
    )
    throw e
  }
}

/**
 * Convert the endpoint and resource path into an absolute URL. As the app bakes
 * the `/api/v3/` path into the endpoint, we need to prevent duplicating this when
 * the API returns pagination headers that also include the `/api/v3/` fragment.
 *
 * @param endpoint The API endpoint
 * @param path The resource path (should be relative to the root of the server)
 */
export function getAbsoluteUrl(endpoint: string, path: string): string {
  let relativePath = path[0] === '/' ? path.substr(1) : path
  if (relativePath.startsWith('api/v3/')) {
    relativePath = relativePath.substr(7)
  }

  // Our API endpoints are a bit sloppy in that they don't typically
  // include the trailing slash (i.e. we use https://api.github.com for
  // dotcom and https://ghe.enterprise.local/api/v3 for Enterprise when
  // both of those should really include the trailing slash since that's
  // the qualified base). We'll work around our past since here by ensuring
  // that the endpoint ends with a trailing slash.
  const base = endpoint.endsWith('/') ? endpoint : `${endpoint}/`

  return new URL(relativePath, base).toString()
}

/**
 * Make an API request.
 *
 * @param endpoint      - The API endpoint.
 * @param token         - The token to use for authentication.
 * @param method        - The HTTP method.
 * @param path          - The path, including any query string parameters.
 * @param jsonBody      - The JSON body to send.
 * @param customHeaders - Any optional additional headers to send.
 */
export function request(
  endpoint: string,
  token: string | null,
  method: HTTPMethod,
  path: string,
  jsonBody?: Object,
  customHeaders?: Object
): Promise<Response> {
  const url = getAbsoluteUrl(endpoint, path)

  let headers: any = {
    Accept: 'application/vnd.github.v3+json, application/json',
    'Content-Type': 'application/json',
    'User-Agent': getUserAgent(),
  }

  if (token) {
    headers['Authorization'] = `token ${token}`
  }

  headers = {
    ...headers,
    ...customHeaders,
  }

  const options = {
    headers,
    method,
    body: JSON.stringify(jsonBody),
  }

  return fetch(url, options)
}

/** Get the user agent to use for all requests. */
function getUserAgent() {
  const platform = __DARWIN__ ? 'Macintosh' : 'Windows'
  return `GitHubDesktop/${appProxy.getVersion()} (${platform})`
}

/**
 * If the response was OK, parse it as JSON and return the result. If not, parse
 * the API error and throw it.
 */
export async function parsedResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return deserialize<T>(response)
  } else {
    let apiError: IAPIError | null
    // Deserializing the API error could throw. If it does, we'll throw a more
    // general API error.
    try {
      apiError = await deserialize<IAPIError>(response)
    } catch (e) {
      throw new APIError(response, null)
    }

    throw new APIError(response, apiError)
  }
}

/**
 * Appends the parameters provided to the url as query string parameters.
 *
 * If the url already has a query the new parameters will be appended.
 */
export function urlWithQueryString(
  url: string,
  params: { [key: string]: string }
): string {
  const qs = Object.keys(params)
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&')

  if (!qs.length) {
    return url
  }

  if (url.indexOf('?') === -1) {
    return `${url}?${qs}`
  } else {
    return `${url}&${qs}`
  }
}
