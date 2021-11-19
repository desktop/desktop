import {
  WebRequest,
  OnBeforeRequestListenerDetails,
  Response,
  OnBeforeSendHeadersListenerDetails,
  BeforeSendResponse,
  OnCompletedListenerDetails,
  OnErrorOccurredListenerDetails,
  OnResponseStartedListenerDetails,
  OnHeadersReceivedListenerDetails,
  HeadersReceivedResponse,
  OnSendHeadersListenerDetails,
  OnBeforeRedirectListenerDetails,
} from 'electron/main'

type SyncListener<TDetails> = (details: TDetails) => void

type AsyncListener<TDetails, TResponse> = (
  details: TDetails
) => Promise<TResponse>

class SyncListenerSet<TDetails> {
  private readonly listeners = new Set<SyncListener<TDetails>>()

  public constructor(
    private readonly subscribe: (
      listener: ((details: TDetails) => void) | null
    ) => void
  ) {}

  public addEventListener(listener: SyncListener<TDetails>) {
    const firstListener = this.listeners.size === 0
    this.listeners.add(listener)

    if (firstListener) {
      this.subscribe(details => this.listeners.forEach(l => l(details)))
    }
  }

  public removeEventListener(listener: SyncListener<TDetails>) {
    this.listeners.delete(listener)
    if (this.listeners.size === 0) {
      this.subscribe(null)
    }
  }
}

class AsyncListenerSet<TDetails, TResponse> {
  private readonly listeners = new Set<AsyncListener<TDetails, TResponse>>()

  public constructor(
    private readonly subscribe: (
      listener:
        | ((details: TDetails, cb: (response: TResponse) => void) => void)
        | null
    ) => void,
    private readonly eventHandler: (
      listeners: Iterable<AsyncListener<TDetails, TResponse>>,
      details: TDetails
    ) => Promise<TResponse>
  ) {}

  public addEventListener(listener: AsyncListener<TDetails, TResponse>) {
    const firstListener = this.listeners.size === 0
    this.listeners.add(listener)

    if (firstListener) {
      this.subscribe(async (details, cb) => {
        cb(await this.eventHandler([...this.listeners], details))
      })
    }
  }

  public removeEventListener(listener: AsyncListener<TDetails, TResponse>) {
    this.listeners.delete(listener)
    if (this.listeners.size === 0) {
      this.subscribe(null)
    }
  }
}

export class OrderedWebRequest {
  public readonly onBeforeRedirect: SyncListenerSet<
    OnBeforeRedirectListenerDetails
  >

  public readonly onBeforeRequest: AsyncListenerSet<
    OnBeforeRequestListenerDetails,
    Response
  >

  public readonly onBeforeSendHeaders: AsyncListenerSet<
    OnBeforeSendHeadersListenerDetails,
    BeforeSendResponse
  >

  public readonly onCompleted: SyncListenerSet<OnCompletedListenerDetails>
  public readonly onErrorOccurred: SyncListenerSet<
    OnErrorOccurredListenerDetails
  >

  public readonly onHeadersReceived: AsyncListenerSet<
    OnHeadersReceivedListenerDetails,
    HeadersReceivedResponse
  >

  public readonly onResponseStarted: SyncListenerSet<
    OnResponseStartedListenerDetails
  >

  public readonly onSendHeaders: SyncListenerSet<OnSendHeadersListenerDetails>

  public constructor(webRequest: WebRequest) {
    this.onBeforeRedirect = new SyncListenerSet(
      webRequest.onBeforeRedirect.bind(webRequest)
    )

    this.onBeforeRequest = new AsyncListenerSet(
      webRequest.onBeforeRequest.bind(webRequest),
      async (listeners, details) => {
        let response: Response = {}

        for (const listener of listeners) {
          response = await listener(details)
          if (response.cancel === true || response.redirectURL !== undefined) {
            break
          }
        }

        return response
      }
    )

    this.onBeforeSendHeaders = new AsyncListenerSet(
      webRequest.onBeforeSendHeaders.bind(webRequest),
      async (listeners, initialDetails) => {
        let details = initialDetails
        let response: BeforeSendResponse = {}

        for (const listener of listeners) {
          response = await listener(details)
          if (response.cancel === true) {
            break
          }

          if (response.requestHeaders !== undefined) {
            const requestHeaders = flattenHeaders(response.requestHeaders)
            details = { ...details, requestHeaders }
          }
        }

        return details
      }
    )

    this.onCompleted = new SyncListenerSet(
      webRequest.onCompleted.bind(webRequest)
    )

    this.onErrorOccurred = new SyncListenerSet(
      webRequest.onErrorOccurred.bind(webRequest)
    )

    this.onHeadersReceived = new AsyncListenerSet(
      webRequest.onHeadersReceived.bind(webRequest),
      async (listeners, initialDetails) => {
        let details = initialDetails
        let response: HeadersReceivedResponse = {}

        for (const listener of listeners) {
          response = await listener(details)
          if (response.cancel === true) {
            break
          }

          if (response.responseHeaders !== undefined) {
            const responseHeaders = unflattenHeaders(response.responseHeaders)
            details = { ...details, responseHeaders }
          }

          if (response.statusLine !== undefined) {
            const { statusLine } = response
            const statusCode = parseInt(statusLine.split(' ', 2)[1], 10)
            details = { ...details, statusLine, statusCode }
          }
        }

        return details
      }
    )

    this.onResponseStarted = new SyncListenerSet(
      webRequest.onResponseStarted.bind(webRequest)
    )

    this.onSendHeaders = new SyncListenerSet(
      webRequest.onSendHeaders.bind(webRequest)
    )
  }
}

// https://stackoverflow.com/a/3097052/2114
const flattenHeaders = (headers: Record<string, string[] | string>) =>
  Object.entries(headers).reduce<Record<string, string>>((h, [k, v]) => {
    h[k] = Array.isArray(v) ? v.join(',') : v
    return h
  }, {})

// https://stackoverflow.com/a/3097052/2114
const unflattenHeaders = (headers: Record<string, string[] | string>) =>
  Object.entries(headers).reduce<Record<string, string[]>>((h, [k, v]) => {
    h[k] = Array.isArray(v) ? v : v.split(',')
    return h
  }, {})
