import {
  WebRequest,
  OnBeforeRequestListenerDetails,
  CallbackResponse,
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

/*
 * A proxy class allowing which handles subscribing to, and unsubscribing from,
 * one of the synchronous events in the WebRequest class such as
 * onBeforeRedirect
 */
class SyncListenerSet<TDetails> {
  private readonly listeners = new Set<SyncListener<TDetails>>()

  public constructor(
    private readonly subscribe: (
      listener: SyncListener<TDetails> | null
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

/*
 * A proxy class allowing which handles subscribing to, and unsubscribing from,
 * one of the asynchronous events in the WebRequest class such as
 * onBeforeRequest
 */
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

/**
 * A utility class allowing consumers to apply more than one WebRequest filter
 * concurrently into the main process.
 *
 * The WebRequest class in Electron allows us to intercept and modify web
 * requests from the renderer process. Unfortunately it only allows one filter
 * to be installed forcing consumers to build monolithic filters. Using
 * OrderedWebRequest consumers can instead subscribe to the event they'd like
 * and OrderedWebRequest will take care of calling them in order and merging the
 * changes each filter applies.
 *
 * Note that OrderedWebRequest is not API compatible with WebRequest and relies
 * on event listeners being asynchronous methods rather than providing a
 * callback parameter to listeners.
 *
 * For documentation of the various events see the Electron WebRequest API
 * documentation.
 */
export class OrderedWebRequest {
  public readonly onBeforeRedirect: SyncListenerSet<OnBeforeRedirectListenerDetails>

  public readonly onBeforeRequest: AsyncListenerSet<
    OnBeforeRequestListenerDetails,
    CallbackResponse
  >

  public readonly onBeforeSendHeaders: AsyncListenerSet<
    OnBeforeSendHeadersListenerDetails,
    BeforeSendResponse
  >

  public readonly onCompleted: SyncListenerSet<OnCompletedListenerDetails>
  public readonly onErrorOccurred: SyncListenerSet<OnErrorOccurredListenerDetails>

  public readonly onHeadersReceived: AsyncListenerSet<
    OnHeadersReceivedListenerDetails,
    HeadersReceivedResponse
  >

  public readonly onResponseStarted: SyncListenerSet<OnResponseStartedListenerDetails>

  public readonly onSendHeaders: SyncListenerSet<OnSendHeadersListenerDetails>

  public constructor(webRequest: WebRequest) {
    this.onBeforeRedirect = new SyncListenerSet(
      webRequest.onBeforeRedirect.bind(webRequest)
    )

    this.onBeforeRequest = new AsyncListenerSet(
      webRequest.onBeforeRequest.bind(webRequest),
      async (listeners, details) => {
        let response: CallbackResponse = {}

        for (const listener of listeners) {
          response = await listener(details)

          // If we encounter a filter which either cancels the request or
          // provides a redirect url we won't process any of the following
          // filters.
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
            // I have no idea why there's a discrepancy of types here.
            // details.requestHeaders is a Record<string, string> but
            // BeforeSendResponse["requestHeaders"] is a
            // Record<string, (string) | (string[])>. Chances are this was done
            // to make it easier for filters but it makes it trickier for us as
            // we have to ensure the next filter gets headers as a
            // Record<string, string>
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
            // See comment about type mismatch in onBeforeSendHeaders
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
