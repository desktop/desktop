import {
  CopilotSdkConnector,
  setCopilotSdkConnector,
} from '../../src/lib/copilot/sdk-client'
import {
  ICopilotSdkModule,
  serveCopilotSdkConnection,
} from '../../src/lib/copilot/sdk-host'
import {
  CopilotSdkClientChannel,
  CopilotSdkHostChannel,
  CopilotSdkRequest,
  CopilotSdkResponse,
  ICopilotSdkChannel,
} from '../../src/lib/copilot/sdk-host-protocol'

interface IChannelEnd<TSend, TReceive> {
  readonly channel: ICopilotSdkChannel<TSend, TReceive>
  readonly deliver: (message: TReceive) => void
  readonly closed: () => void
}

function createChannelEnd<TSend, TReceive>(
  getPeer: () => IChannelEnd<TReceive, TSend>,
  isOpen: () => boolean,
  close: () => void
): IChannelEnd<TSend, TReceive> {
  let onMessage: ((message: TReceive) => void) | undefined
  const queued = new Array<TReceive>()
  const closeListeners = new Array<() => void>()

  return {
    channel: {
      // Clone like a real port so non-cloneable values fail in tests too.
      send: message => {
        if (!isOpen()) {
          return
        }
        const clone = structuredClone(message)
        queueMicrotask(() => {
          if (isOpen()) {
            getPeer().deliver(clone)
          }
        })
      },
      onMessage: listener => {
        onMessage = listener
        queued.splice(0).forEach(listener)
      },
      onClose: listener => closeListeners.push(listener),
      close,
    },
    deliver: message =>
      onMessage === undefined ? queued.push(message) : onMessage(message),
    closed: () => closeListeners.splice(0).forEach(listener => listener()),
  }
}

/**
 * Create a connected pair of in-memory channels.
 *
 * Messages are structured-cloned and delivered in order on a microtask.
 * Closing either end notifies both, like an entangled `MessagePort`.
 */
export function createCopilotSdkChannelPair(): {
  readonly client: CopilotSdkClientChannel
  readonly host: CopilotSdkHostChannel
} {
  let isClosed = false
  const isOpen = () => !isClosed
  const close = () => {
    if (!isClosed) {
      isClosed = true
      queueMicrotask(() => {
        client.closed()
        host.closed()
      })
    }
  }
  const client: IChannelEnd<CopilotSdkRequest, CopilotSdkResponse> =
    createChannelEnd(() => host, isOpen, close)
  const host: IChannelEnd<CopilotSdkResponse, CopilotSdkRequest> =
    createChannelEnd(() => client, isOpen, close)
  return { client: client.channel, host: host.channel }
}

/**
 * Create a connector that serves each client in-process.
 *
 * The SDK module is loaded per connection so that `mock.module` applied
 * before a client is created is honored.
 */
export function createInProcessCopilotSdkConnector(
  loadSdk: () => Promise<ICopilotSdkModule> = () =>
    import('@github/copilot-sdk')
): CopilotSdkConnector {
  return async () => {
    const sdk = await loadSdk()
    const { client, host } = createCopilotSdkChannelPair()
    serveCopilotSdkConnection(host, sdk)
    return client
  }
}

/**
 * Serve Copilot SDK clients in-process for the rest of the test file.
 *
 * Returns a function that restores the previous connector.
 */
export function useInProcessCopilotSdkHost(
  loadSdk?: () => Promise<ICopilotSdkModule>
): () => void {
  return setCopilotSdkConnector(createInProcessCopilotSdkConnector(loadSdk))
}
