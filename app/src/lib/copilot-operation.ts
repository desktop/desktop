import type {
  AssistantMessageEvent,
  CopilotClient,
  CopilotSession,
  MessageOptions,
  SessionConfig,
  SessionEventPayload,
} from '@github/copilot-sdk'
import { getCopilotPaymentRequiredErrorFromSessionError } from './copilot-error'

/** Native response-schema vocabulary shared by the supported strict providers. */
export type CopilotResponseSchema =
  | {
      readonly type: 'object'
      readonly properties: Readonly<Record<string, CopilotResponseSchema>>
      readonly required: ReadonlyArray<string>
      readonly additionalProperties: false
    }
  | { readonly type: 'array'; readonly items: CopilotResponseSchema }
  | {
      readonly type: 'string'
      readonly enum?: ReadonlyArray<string>
    }
  | { readonly type: 'null' | readonly ['string', 'null'] }
  | { readonly anyOf: ReadonlyArray<CopilotResponseSchema> }

/** Cancellation controls for SDK operations, preserving the caller's domain error. */
export interface ICancellableCopilotOperationOptions<T> {
  readonly signal?: AbortSignal
  readonly cancellationError: () => Error
  /** Dispose resources returned after cancellation; failures must be reported. */
  readonly disposeLateValue?: (value: T) => void | Promise<void>
  /** Report secondary failures from interrupted resource setup after cancellation was delivered. */
  readonly onLateError?: (error: unknown) => void
}

/**
 * Await SDK setup, metadata, or a response without blocking cancellation.
 *
 * Cancels only this waiter, never shared token renewal or model discovery.
 * The operation's rejection is always observed. A resource that arrives after
 * cancellation is disposed exactly once; late disposal errors are logged since
 * the cancellation has already been delivered to the caller.
 */
export async function awaitCancellableCopilotOperation<T>(
  operation: () => Promise<T>,
  options: ICancellableCopilotOperationOptions<T>
): Promise<T> {
  const { signal, cancellationError, disposeLateValue, onLateError } = options
  if (signal?.aborted) {
    throw cancellationError()
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const onAbort = () => {
      if (!settled) {
        settled = true
        signal?.removeEventListener('abort', onAbort)
        reject(cancellationError())
      }
    }
    signal?.addEventListener('abort', onAbort)
    if (signal?.aborted) {
      onAbort()
      return
    }
    let pending: Promise<T>
    try {
      pending = operation()
    } catch (error) {
      settled = true
      signal?.removeEventListener('abort', onAbort)
      reject(signal?.aborted ? cancellationError() : error)
      return
    }
    pending.then(
      value => {
        if (signal?.aborted) {
          onAbort()
        }
        if (settled) {
          const reportCleanupError = (error: unknown) => {
            log.error(
              'Copilot: Failed to dispose a late-created resource',
              error instanceof Error
                ? error
                : new Error('Late resource cleanup failed', { cause: error })
            )
          }
          try {
            void Promise.resolve(disposeLateValue?.(value)).catch(
              reportCleanupError
            )
          } catch (error) {
            reportCleanupError(error)
          }
          return
        }
        settled = true
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      },
      error => {
        if (!settled) {
          settled = true
          signal?.removeEventListener('abort', onAbort)
          reject(signal?.aborted ? cancellationError() : error)
        } else {
          onLateError?.(error)
        }
      }
    )
  })
}
/** The SDK message/session surface shared by commit messages and planning. */
export interface ICopilotMessageSession {
  onSessionError(
    handler: (data: SessionEventPayload<'session.error'>['data']) => void
  ): () => void
  sendAndWait(
    options: MessageOptions,
    timeoutMs: number
  ): Promise<AssistantMessageEvent | undefined>
  disconnect(): Promise<void>
}

/** Events needed to correlate a submitted run with its final root response. */
export type CopilotResponseEvent = SessionEventPayload<
  | 'user.message'
  | 'assistant.message'
  | 'session.idle'
  | 'session.autopilot_stopped'
  | 'session.error'
>

/** Caller-owned event waiting; never call SDK sendAndWait for an interruptible planning turn. */
export interface ICopilotPlanningSession extends ICopilotMessageSession {
  onResponseEvent(handler: (event: CopilotResponseEvent) => void): () => void
  send(options: MessageOptions): Promise<string>
}

/** The existing SDK client surface needed for an owned planning session. */
export interface ICopilotPlanningClient {
  createSession(config: SessionConfig): Promise<ICopilotPlanningSession>
  stop(): Promise<ReadonlyArray<Error>>
  forceStop(): Promise<void>
}

/** Adapt SDK event overloads without weakening their types in callers/tests. */
export function getCopilotMessageSession(
  session: CopilotSession
): ICopilotMessageSession {
  return {
    onSessionError: handler =>
      session.on('session.error', event => handler(event.data)),
    sendAndWait: (options, timeoutMs) =>
      session.sendAndWait(options, timeoutMs),
    disconnect: () => session.disconnect(),
  }
}

/** Adapt SDK send/events while keeping all response subscriptions owned by Desktop. */
export function getCopilotPlanningSession(
  session: CopilotSession
): ICopilotPlanningSession {
  return {
    ...getCopilotMessageSession(session),
    onResponseEvent: handler =>
      session.on(event => {
        switch (event.type) {
          case 'user.message':
          case 'assistant.message':
          case 'session.idle':
          case 'session.autopilot_stopped':
          case 'session.error':
            handler(event)
        }
      }),
    send: options => session.send(options),
  }
}

/**
 * Await the SDK's response with caller-owned cancellation and billing metadata.
 *
 * Unlike planning, nonbilling session errors are logged, not terminal. A 402
 * replaces an SDK rejection but never overrides a successful SDK response.
 * The SDK owns the response timeout; the caller still owns session teardown.
 */
export async function sendCopilotMessageRequest(
  session: ICopilotMessageSession,
  options: MessageOptions,
  timeoutMs: number,
  cancellation: ICancellableCopilotOperationOptions<
    AssistantMessageEvent | undefined
  >
): Promise<AssistantMessageEvent | undefined> {
  let paymentRequiredError: Error | undefined
  const unsubscribe = session.onSessionError(data => {
    const captured = getCopilotPaymentRequiredErrorFromSessionError(data)
    if (captured !== null) {
      paymentRequiredError = captured
    } else {
      const error = new Error(data.message)
      if (data.stack !== undefined) {
        error.stack = data.stack
      }
      log.error(`CopilotStore: Session error (${data.errorType})`, error)
    }
  })
  try {
    return await awaitCancellableCopilotOperation(
      () =>
        session.sendAndWait(options, timeoutMs).catch(error => {
          throw paymentRequiredError ?? error
        }),
      cancellation
    )
  } finally {
    unsubscribe()
  }
}

/**
 * Wait for the final matching root response using the caller's deadline.
 *
 * Subscribe before sending and replay events after admission establishes the
 * origin. Stop-hook corrections supersede earlier messages; tool requests
 * invalidate an earlier candidate. Idle alone is not proof of request ownership.
 * Every listener is released on completion, failure or cancellation.
 */
export async function sendCopilotPlanningRequest(
  session: ICopilotPlanningSession,
  options: MessageOptions,
  signal: AbortSignal,
  cancellationError: () => Error,
  sessionError: (
    data: SessionEventPayload<'session.error'>['data']
  ) => Error = data =>
    getCopilotPaymentRequiredErrorFromSessionError(data) ??
    new Error(data.message, { cause: data })
): Promise<AssistantMessageEvent | undefined> {
  if (signal.aborted) {
    throw cancellationError()
  }
  return new Promise((resolve, reject) => {
    let settled = false
    let response: AssistantMessageEvent | undefined
    let messageId: string | undefined
    let consumed = false
    const buffered: CopilotResponseEvent[] = []
    const finish = (complete: () => void) => {
      if (settled) {
        return
      }
      settled = true
      signal.removeEventListener('abort', onAbort)
      unsubscribe()
      buffered.length = 0
      complete()
    }
    const onAbort = () => finish(() => reject(cancellationError()))
    const observe = (event: CopilotResponseEvent) => {
      if (settled || event.agentId !== undefined) {
        return
      }
      switch (event.type) {
        case 'user.message':
          if (event.data.messageId === messageId) {
            consumed = true
          }
          break
        case 'assistant.message':
          if (event.data.originatingMessageId === messageId) {
            consumed = true
            response = event.data.toolRequests?.length ? undefined : event
          }
          break
        case 'session.error':
          if (
            event.data.originatingMessageId === undefined ||
            event.data.originatingMessageId === messageId
          ) {
            finish(() => reject(sessionError(event.data)))
          }
          break
        case 'session.idle':
          if (consumed && event.data.mode !== 'autopilot') {
            if (event.data.aborted) {
              finish(() =>
                reject(new Error('Copilot run was aborted before completion'))
              )
            } else {
              finish(() => resolve(response))
            }
          }
          break
        case 'session.autopilot_stopped':
          if (event.data.requestId === messageId) {
            if (
              event.data.reason === 'aborted' ||
              event.data.reason === 'error'
            ) {
              finish(() =>
                reject(new Error(`Copilot run stopped: ${event.data.reason}`))
              )
            } else {
              finish(() => resolve(response))
            }
          }
          break
      }
    }
    const unsubscribe = session.onResponseEvent(event => {
      if (event.agentId !== undefined || settled) {
        return
      }
      // Session-wide failures do not need admission to establish ownership.
      if (
        event.type === 'session.error' &&
        event.data.originatingMessageId === undefined
      ) {
        finish(() => reject(sessionError(event.data)))
      } else if (messageId === undefined) {
        buffered.push(event)
      } else {
        observe(event)
      }
    })
    signal.addEventListener('abort', onAbort)
    if (signal.aborted) {
      onAbort()
      return
    }
    try {
      void session.send(options).then(
        id => {
          if (settled) {
            return
          }
          if (!id) {
            finish(() =>
              reject(
                new Error('Copilot send returned no originating message ID')
              )
            )
            return
          }
          messageId = id
          const events = buffered.splice(0)
          events.forEach(observe)
        },
        error =>
          finish(() => reject(signal.aborted ? cancellationError() : error))
      )
    } catch (error) {
      finish(() => reject(signal.aborted ? cancellationError() : error))
    }
  })
}

/** Reuse an existing SDK client; the adapter does not create or own extra resources. */
export function getCopilotPlanningClient(
  client: CopilotClient,
  createSession: (config: SessionConfig) => Promise<CopilotSession> = config =>
    client.createSession(config)
): ICopilotPlanningClient {
  return {
    createSession: async config =>
      getCopilotPlanningSession(await createSession(config)),
    stop: () => client.stop(),
    forceStop: () => client.forceStop(),
  }
}
