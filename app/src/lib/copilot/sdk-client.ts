import type {
  AssistantMessageEvent,
  CopilotClient as SdkCopilotClient,
  CopilotClientOptions,
  MessageOptions,
  ModelInfo,
  ResumeSessionConfig,
  SessionConfig,
  SessionEvent,
  SessionEventHandler,
  SessionEventType,
  StdioRuntimeConnection,
  TypedSessionEventHandler,
} from '@github/copilot-sdk'
import {
  CopilotSdkCallback,
  CopilotSdkCallTarget,
  CopilotSdkClientChannel,
  CopilotSdkResponse,
  ICopilotSdkSessionHandle,
  decodeCopilotSdkValue,
  deserializeCopilotSdkError,
  encodeCopilotSdkValue,
  getCopilotSdkResult,
} from './sdk-host-protocol'
import { requestCopilotSdkChannel } from './sdk-host-port'

/**
 * Renderer proxies for the Copilot SDK's `CopilotClient` and
 * `CopilotSession`.
 *
 * The real SDK runs in a separate utility process (see `sdk-host.ts`), keeping
 * its Node.js `AsyncLocalStorage` usage out of the renderer, where V8 can crash
 * on it (see docs/technical/copilot-sdk-host.md). These classes mirror the
 * subset of the SDK API Desktop uses:
 *
 * - Callbacks in options and configs (e.g. `gitHubTokenProvider`) are called
 *   back in the renderer and always become asynchronous.
 * - `createSessionFsProvider` isn't supported: the host gives every session an
 *   in-memory filesystem when the client is configured with `sessionFs`.
 * - Errors keep their name, message, stack and `code`, but not their class.
 */

/** Opens the port to the SDK host for a new client. */
export type CopilotSdkConnector = () => Promise<CopilotSdkClientChannel>

/** Session configuration supported by the proxy. */
export type CopilotSessionConfig = Omit<
  SessionConfig,
  'createSessionFsProvider'
>

/** Resume configuration supported by the proxy. */
export type CopilotResumeSessionConfig = Omit<
  ResumeSessionConfig,
  'createSessionFsProvider'
>

let connector: CopilotSdkConnector = requestCopilotSdkChannel

/**
 * Replace how new clients reach the SDK host, e.g. to serve them in-process
 * from tests.
 *
 * @returns a function that restores the previous connector
 */
export function setCopilotSdkConnector(
  newConnector: CopilotSdkConnector
): () => void {
  const previous = connector
  connector = newConnector
  return () => {
    connector = previous
  }
}

/** Mirrors the SDK's `RuntimeConnection` factory used by Desktop. */
export const RuntimeConnection = {
  forStdio(
    options: Omit<StdioRuntimeConnection, 'kind'> = {}
  ): StdioRuntimeConnection {
    return { kind: 'stdio', ...options }
  },
}

/** The renderer's side of a client's port. */
class CopilotSdkConnection {
  private nextCallId = 0
  private nextCallbackId = 0
  private closed = false
  private readonly pendingCalls = new Map<
    number,
    {
      readonly resolve: (value: unknown) => void
      readonly reject: (error: Error) => void
    }
  >()
  private readonly callbacks = new Map<number, CopilotSdkCallback>()
  private readonly sessions = new Map<string, CopilotSession>()

  public constructor(private readonly channel: CopilotSdkClientChannel) {
    channel.onMessage(this.onMessage)
    channel.onClose(this.onClose)
  }

  public init(options: CopilotClientOptions) {
    this.channel.send({ type: 'init', options: this.encode(options) })
  }

  public call(
    target: CopilotSdkCallTarget,
    path: ReadonlyArray<string>,
    args: ReadonlyArray<unknown>
  ): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(getDisconnectedError())
    }
    const id = this.nextCallId++
    return new Promise((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject })
      this.channel.send({
        type: 'call',
        id,
        target,
        path,
        args: args.map(this.encode),
      })
    })
  }

  public addSession(session: CopilotSession) {
    this.sessions.set(session.sessionId, session)
  }

  public removeSession(sessionId: string) {
    this.sessions.delete(sessionId)
  }

  public close() {
    this.channel.close()
    this.onClose()
  }

  private encode = (value: unknown) =>
    encodeCopilotSdkValue(value, callback => {
      const id = this.nextCallbackId++
      this.callbacks.set(id, callback)
      return id
    })

  private decode = (value: unknown) =>
    decodeCopilotSdkValue(value, () => {
      throw new Error('The Copilot SDK host cannot send callbacks')
    })

  private onMessage = (message: CopilotSdkResponse) => {
    switch (message.type) {
      case 'result': {
        const pending = this.pendingCalls.get(message.id)
        this.pendingCalls.delete(message.id)
        if (pending === undefined) {
          return
        }
        const { result } = message
        if (result.ok) {
          pending.resolve(this.decode(result.value))
        } else {
          pending.reject(deserializeCopilotSdkError(result.error))
        }
        return
      }
      case 'event':
        this.sessions
          .get(message.sessionId)
          ?.dispatch(this.decode(message.event) as SessionEvent)
        return
      case 'callback': {
        const { id, callbackId, args } = message
        getCopilotSdkResult(() => {
          const callback = this.callbacks.get(callbackId)
          if (callback === undefined) {
            throw new Error(`Unknown Copilot SDK callback ${callbackId}`)
          }
          return callback(...args.map(this.decode))
        }, this.encode).then(result => {
          if (!this.closed) {
            this.channel.send({ type: 'callback-result', id, result })
          }
        })
        return
      }
    }
  }

  private onClose = () => {
    if (this.closed) {
      return
    }
    this.closed = true
    const error = getDisconnectedError()
    for (const pending of this.pendingCalls.values()) {
      pending.reject(error)
    }
    this.pendingCalls.clear()
    this.callbacks.clear()
    this.sessions.clear()
  }
}

function getDisconnectedError() {
  return new Error('The Copilot SDK host process disconnected')
}

/** A session of a {@link CopilotClient}; mirrors the SDK's `CopilotSession`. */
export class CopilotSession {
  private readonly handlers = new Set<SessionEventHandler>()

  /** Created by {@link CopilotClient}; not part of the SDK's API. */
  public constructor(
    public readonly sessionId: string,
    private readonly connection: CopilotSdkConnection
  ) {}

  /** Typed session RPC methods. */
  public get rpc(): CopilotSdkSessionRpc {
    return createRpcProxy(['rpc'], (path, args) =>
      this.call(path, args)
    ) as CopilotSdkSessionRpc
  }

  public on<K extends SessionEventType>(
    eventType: K,
    handler: TypedSessionEventHandler<K>
  ): () => void
  public on(handler: SessionEventHandler): () => void
  public on(
    eventTypeOrHandler: SessionEventType | SessionEventHandler,
    typedHandler?: (event: never) => void
  ): () => void {
    const handler: SessionEventHandler =
      typeof eventTypeOrHandler === 'function'
        ? eventTypeOrHandler
        : event => {
            if (event.type === eventTypeOrHandler) {
              ;(typedHandler as SessionEventHandler | undefined)?.(event)
            }
          }
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  public send(options: MessageOptions): Promise<string> {
    return this.call(['send'], [options]) as Promise<string>
  }

  public sendAndWait(
    options: MessageOptions,
    timeout?: number
  ): Promise<AssistantMessageEvent | undefined> {
    return this.call(['sendAndWait'], [options, timeout]) as Promise<
      AssistantMessageEvent | undefined
    >
  }

  public async abort(): Promise<void> {
    await this.call(['abort'], [])
  }

  public async disconnect(): Promise<void> {
    try {
      await this.call(['disconnect'], [])
    } finally {
      this.handlers.clear()
      this.connection.removeSession(this.sessionId)
    }
  }

  /** Deliver an event from the SDK host; not part of the SDK's API. */
  public dispatch(event: SessionEvent) {
    for (const handler of [...this.handlers]) {
      try {
        handler(event)
      } catch (error) {
        log.error('Copilot session event handler failed', error)
      }
    }
  }

  private call(path: ReadonlyArray<string>, args: ReadonlyArray<unknown>) {
    return this.connection.call(
      { kind: 'session', sessionId: this.sessionId },
      path,
      args
    )
  }
}

type CopilotSdkSessionRpc = import('@github/copilot-sdk').CopilotSession['rpc']

/** Build `rpc.a.b(...)` call paths without knowing the RPC surface. */
function createRpcProxy(
  path: ReadonlyArray<string>,
  call: (path: ReadonlyArray<string>, args: ReadonlyArray<unknown>) => unknown
): unknown {
  return new Proxy(() => {}, {
    // Ignore `then` so that RPC namespaces aren't mistaken for promises.
    get: (_target, key) =>
      typeof key === 'string' && key !== 'then'
        ? createRpcProxy([...path, key], call)
        : undefined,
    apply: (_target, _thisArg, args) => call(path, args),
  })
}

/**
 * A Copilot SDK client running in the SDK host process.
 *
 * Mirrors the SDK's `CopilotClient`. Stop every client with `stop` or
 * `forceStop`; that releases its port and lets the host shut down when idle.
 */
export class CopilotClient {
  private readonly connection: Promise<CopilotSdkConnection>
  private stopping: Promise<Error[]> | undefined
  private stopped = false

  public constructor(
    options: CopilotClientOptions = {},
    connect: CopilotSdkConnector = connector
  ) {
    this.connection = connect().then(channel => {
      const connection = new CopilotSdkConnection(channel)
      connection.init(options)
      return connection
    })
    // Failures surface from each call instead.
    this.connection.catch(() => {})
  }

  /** Typed server RPC methods, e.g. `client.rpc.account.getQuota()`. */
  public get rpc(): SdkCopilotClient['rpc'] {
    return createRpcProxy(['rpc'], (path, args) =>
      this.call(path, args)
    ) as SdkCopilotClient['rpc']
  }

  public async start(): Promise<void> {
    await this.call(['start'], [])
  }

  public async stop(): Promise<Error[]> {
    // Like the SDK, stopping is idempotent.
    if (this.stopped) {
      return []
    }
    this.stopping ??= this.callAndClose(['stop']).then(
      errors => errors as Error[]
    )
    return this.stopping
  }

  public async forceStop(): Promise<void> {
    if (!this.stopped) {
      await this.callAndClose(['forceStop'])
    }
  }

  public async createSession(
    config: CopilotSessionConfig
  ): Promise<CopilotSession> {
    return this.addSession(await this.call(['createSession'], [config]))
  }

  public async resumeSession(
    sessionId: string,
    config: CopilotResumeSessionConfig
  ): Promise<CopilotSession> {
    return this.addSession(
      await this.call(['resumeSession'], [sessionId, config])
    )
  }

  public async listModels(): Promise<ModelInfo[]> {
    return (await this.call(['listModels'], [])) as ModelInfo[]
  }

  public ping(message?: string): ReturnType<SdkCopilotClient['ping']> {
    return this.call(['ping'], [message]) as ReturnType<
      SdkCopilotClient['ping']
    >
  }

  private async call(
    path: ReadonlyArray<string>,
    args: ReadonlyArray<unknown>
  ): Promise<unknown> {
    const connection = await this.connection
    return connection.call({ kind: 'client' }, path, args)
  }

  private async addSession(handle: unknown): Promise<CopilotSession> {
    const { sessionId } = handle as ICopilotSdkSessionHandle
    const connection = await this.connection
    const session = new CopilotSession(sessionId, connection)
    connection.addSession(session)
    return session
  }

  private async callAndClose(path: ReadonlyArray<string>) {
    try {
      return await this.call(path, [])
    } finally {
      this.stopped = true
      const connection = await this.connection.catch(() => null)
      connection?.close()
    }
  }
}
