import type {
  CopilotClient,
  CopilotClientOptions,
  CopilotSession,
  SessionConfig,
} from '@github/copilot-sdk'
import {
  CopilotSdkCallTarget,
  CopilotSdkHostChannel,
  CopilotSdkRequest,
  CopilotSdkResult,
  ICopilotSdkSessionHandle,
  decodeCopilotSdkValue,
  deserializeCopilotSdkError,
  encodeCopilotSdkValue,
  getCopilotSdkResult,
} from './sdk-host-protocol'
import {
  ICopilotInMemorySessionFsProvider,
  createCopilotInMemorySessionFsProvider,
} from '../copilot-in-memory-session-fs-provider'

/** The part of the SDK module the host needs. */
export interface ICopilotSdkModule {
  readonly CopilotClient: new (options?: CopilotClientOptions) => CopilotClient
}

const ClientMethods: ReadonlySet<string> = new Set([
  'start',
  'stop',
  'forceStop',
  'createSession',
  'resumeSession',
  'listModels',
  'ping',
  'getStatus',
  'getAuthStatus',
  'rpc',
])

const SessionMethods: ReadonlySet<string> = new Set([
  'send',
  'sendAndWait',
  'abort',
  'disconnect',
  'getEvents',
  'rpc',
])

/**
 * Serve one renderer `CopilotClient` over a message port, running the real
 * SDK client in this process.
 *
 * Sessions get an in-memory session filesystem whenever the client is
 * configured with `sessionFs`, since filesystem callbacks can't cross
 * processes synchronously.
 *
 * @returns a promise that resolves once the port closes and the client has
 * been cleaned up. A client still running at that point is force-stopped.
 */
export function serveCopilotSdkConnection(
  channel: CopilotSdkHostChannel,
  sdk: ICopilotSdkModule
): Promise<void> {
  let client: CopilotClient | undefined
  let clientOptions: CopilotClientOptions | undefined
  let initError: unknown
  let stopped = false
  let closed = false
  let nextCallbackRequestId = 0
  const sessions = new Map<string, CopilotSession>()
  const fileSystems = new Map<
    CopilotSession,
    ICopilotInMemorySessionFsProvider
  >()
  const pendingCallbacks = new Map<
    number,
    {
      readonly resolve: (value: unknown) => void
      readonly reject: (error: Error) => void
    }
  >()

  const decode = (value: unknown) =>
    decodeCopilotSdkValue(
      value,
      callbackId =>
        (...args: ReadonlyArray<unknown>) =>
          new Promise((resolve, reject) => {
            if (closed) {
              reject(new Error('The Copilot client was disconnected'))
              return
            }
            const id = nextCallbackRequestId++
            pendingCallbacks.set(id, { resolve, reject })
            channel.send({
              type: 'callback',
              id,
              callbackId,
              args: args.map(arg => encodeCopilotSdkValue(arg)),
            })
          })
    )

  const disposeFileSystem = (session: CopilotSession) => {
    fileSystems.get(session)?.dispose()
    fileSystems.delete(session)
  }

  const disposeAll = () => {
    for (const session of sessions.values()) {
      disposeFileSystem(session)
    }
    for (const fs of fileSystems.values()) {
      fs.dispose()
    }
    fileSystems.clear()
    sessions.clear()
  }

  const getTarget = (target: CopilotSdkCallTarget): object => {
    if (client === undefined) {
      throw initError ?? new Error('The Copilot client was not initialized')
    }
    if (target.kind === 'client') {
      return client
    }
    const session = sessions.get(target.sessionId)
    if (session === undefined) {
      throw new Error(`Copilot session ${target.sessionId} is not connected`)
    }
    return session
  }

  const withSessionFs = (config: SessionConfig): SessionConfig =>
    clientOptions?.sessionFs === undefined
      ? config
      : {
          ...config,
          createSessionFsProvider: session => {
            const fs = createCopilotInMemorySessionFsProvider()
            fileSystems.set(session, fs)
            return fs
          },
        }

  const call = async (
    target: CopilotSdkCallTarget,
    path: ReadonlyArray<string>,
    args: ReadonlyArray<unknown>
  ): Promise<unknown> => {
    const allowed = target.kind === 'client' ? ClientMethods : SessionMethods
    if (path.length === 0 || !allowed.has(path[0])) {
      throw new Error(`Unsupported Copilot SDK call: ${path.join('.')}`)
    }

    const object = getTarget(target)
    const decodedArgs = args.map(decode)
    if (
      target.kind === 'client' &&
      path.length === 1 &&
      (path[0] === 'createSession' || path[0] === 'resumeSession')
    ) {
      const configIndex = path[0] === 'createSession' ? 0 : 1
      decodedArgs[configIndex] = withSessionFs(
        decodedArgs[configIndex] as SessionConfig
      )
      return registerSession(await invoke(object, path, decodedArgs))
    }

    const result = await invoke(object, path, decodedArgs)

    if (target.kind === 'session' && path.length === 1) {
      if (path[0] === 'disconnect') {
        const session = sessions.get(target.sessionId)
        sessions.delete(target.sessionId)
        if (session !== undefined) {
          disposeFileSystem(session)
        }
      }
    } else if (
      path.length === 1 &&
      (path[0] === 'stop' || path[0] === 'forceStop')
    ) {
      stopped = true
      disposeAll()
    }

    return result
  }

  const registerSession = (session: unknown): ICopilotSdkSessionHandle => {
    if (!isCopilotSession(session)) {
      throw new Error('The Copilot SDK did not return a session')
    }
    const { sessionId } = session
    sessions.set(sessionId, session)
    session.on(event => {
      if (!closed && sessions.get(sessionId) === session) {
        channel.send({
          type: 'event',
          sessionId,
          event: encodeCopilotSdkValue(event),
        })
      }
    })
    return { sessionId }
  }

  const send = (id: number, result: CopilotSdkResult) => {
    if (!closed) {
      channel.send({ type: 'result', id, result })
    }
  }

  const onMessage = (message: CopilotSdkRequest) => {
    switch (message.type) {
      case 'init':
        if (client !== undefined || initError !== undefined) {
          return
        }
        try {
          clientOptions = decode(message.options) as CopilotClientOptions
          client = new sdk.CopilotClient(clientOptions)
        } catch (error) {
          initError = error
        }
        return
      case 'call': {
        const { id, target, path, args } = message
        getCopilotSdkResult(
          () => call(target, path, args),
          encodeCopilotSdkValue
        ).then(result => send(id, result))
        return
      }
      case 'callback-result': {
        const pending = pendingCallbacks.get(message.id)
        pendingCallbacks.delete(message.id)
        if (pending !== undefined) {
          const { result } = message
          if (result.ok) {
            pending.resolve(decode(result.value))
          } else {
            pending.reject(deserializeCopilotSdkError(result.error))
          }
        }
        return
      }
    }
  }

  return new Promise<void>(resolve => {
    channel.onMessage(onMessage)
    channel.onClose(async () => {
      if (closed) {
        return
      }
      closed = true
      const error = new Error('The Copilot client was disconnected')
      for (const pending of pendingCallbacks.values()) {
        pending.reject(error)
      }
      pendingCallbacks.clear()
      if (client !== undefined && !stopped) {
        stopped = true
        await client.forceStop().catch(() => {})
      }
      disposeAll()
      resolve()
    })
  })
}

function invoke(
  object: object,
  path: ReadonlyArray<string>,
  args: ReadonlyArray<unknown>
): unknown {
  let thisArg: unknown = object
  for (const key of path.slice(0, -1)) {
    thisArg = (thisArg as Record<string, unknown>)[key]
    if (typeof thisArg !== 'object' || thisArg === null) {
      throw new Error(`Unsupported Copilot SDK call: ${path.join('.')}`)
    }
  }
  const method = (thisArg as Record<string, unknown>)[path[path.length - 1]]
  if (typeof method !== 'function') {
    throw new Error(`Unsupported Copilot SDK call: ${path.join('.')}`)
  }
  return method.apply(thisArg, args)
}

function isCopilotSession(value: unknown): value is CopilotSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sessionId' in value &&
    typeof value.sessionId === 'string' &&
    'on' in value &&
    typeof value.on === 'function'
  )
}
