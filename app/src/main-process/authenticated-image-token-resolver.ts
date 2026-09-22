import { WebContents } from 'electron'
import { EndpointToken } from '../lib/endpoint-token'
import * as ipcWebContents from './ipc-webcontents'
import { isTrustedIPCSender } from './trusted-ipc-sender'

/**
 * Requests fresh image credentials from the current main renderer. Replies
 * from other windows, old requests, and timed-out requests are ignored.
 */
export function createAuthenticatedImageTokenResolver(
  getRenderer: () => WebContents | undefined,
  timeoutMilliseconds = 35_000
) {
  let nextRequestId = 0
  const pending = new Map<
    number,
    {
      readonly sender: WebContents
      readonly endpoint: string
      readonly finish: (token: string | null) => void
    }
  >()

  return {
    resolveToken: (endpoint: string, token: string): Promise<string> => {
      const sender = getRenderer()
      if (
        sender === undefined ||
        sender.isDestroyed() ||
        !isTrustedIPCSender(sender)
      ) {
        return Promise.reject(new Error('Image authentication unavailable'))
      }

      return new Promise((resolve, reject) => {
        const requestId = nextRequestId++
        const finish = (resolvedToken: string | null) => {
          clearTimeout(timeout)
          pending.delete(requestId)
          if (resolvedToken) {
            resolve(resolvedToken)
          } else {
            reject(new Error('Image authentication unavailable'))
          }
        }
        const timeout = setTimeout(() => finish(null), timeoutMilliseconds)
        pending.set(requestId, { sender, endpoint, finish })
        try {
          ipcWebContents.send(
            sender,
            'resolve-image-token',
            requestId,
            endpoint,
            token
          )
        } catch {
          finish(null)
        }
      })
    },
    acceptResponse: (
      sender: WebContents,
      requestId: number,
      token: string | null
    ) => {
      const request = pending.get(requestId)
      if (
        request === undefined ||
        request.sender !== sender ||
        sender !== getRenderer() ||
        sender.isDestroyed() ||
        !isTrustedIPCSender(sender)
      ) {
        return
      }
      request.finish(typeof token === 'string' ? token : null)
    },
    updateAccounts: (accounts: ReadonlyArray<EndpointToken>) => {
      for (const request of pending.values()) {
        if (!accounts.some(account => account.endpoint === request.endpoint)) {
          request.finish(null)
        }
      }
    },
  }
}
