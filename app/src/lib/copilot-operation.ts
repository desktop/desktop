/** Cancellation controls for SDK operations, preserving the caller's domain error. */
export interface ICancellableCopilotOperationOptions<T> {
  readonly signal?: AbortSignal
  readonly cancellationError: () => Error
  /** Dispose resources returned after cancellation; failures must be reported. */
  readonly disposeLateValue?: (value: T) => Promise<void>
  /** Report secondary failures from interrupted resource setup after cancellation was delivered. */
  readonly onLateError?: (error: unknown) => void
}

/**
 * Await SDK setup/metadata without blocking cancellation on a pending promise.
 *
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
            void disposeLateValue?.(value).catch(reportCleanupError)
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
import type {
  AssistantMessageEvent,
  CopilotClient,
  CopilotSession,
  MessageOptions,
  SessionConfig,
  SessionEventPayload,
} from '@github/copilot-sdk'
import { getCopilotPaymentRequiredErrorFromSessionError } from './copilot-error'

/** The SDK message/session surface used by the constrained planner. */
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

/** Planner-owned event waiting; never call SDK sendAndWait for an interruptible planning turn. */
export interface ICopilotPlanningSession extends ICopilotMessageSession {
  onAssistantMessage(
    handler: (event: AssistantMessageEvent) => void
  ): () => void
  onIdle(handler: () => void): () => void
  send(options: MessageOptions): Promise<string>
}

/** The existing SDK client surface needed for an owned planning session. */
export interface ICopilotPlanningClient {
  createSession(config: SessionConfig): Promise<ICopilotPlanningSession>
  stop(): Promise<ReadonlyArray<Error>>
  forceStop(): Promise<void>
}

/** Adapt SDK event overloads without weakening their types in planner backends/tests. */
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
    onAssistantMessage: handler => session.on('assistant.message', handler),
    onIdle: handler => session.on('session.idle', handler),
    send: options => session.send(options),
  }
}

/**
 * Wait for a complete primary response/idle using the enclosing planner's deadline.
 *
 * Every subscription and abort handler is released on success/error/cancellation.
 * No SDK-owned response timer can outlive a disconnected ephemeral session.
 */
export async function sendCopilotPlanningRequest(
  session: ICopilotPlanningSession,
  options: MessageOptions,
  signal: AbortSignal,
  cancellationError: () => Error
): Promise<AssistantMessageEvent | undefined> {
  if (signal.aborted) {
    throw cancellationError()
  }
  return new Promise((resolve, reject) => {
    let settled = false
    let response: AssistantMessageEvent | undefined
    let sendFinished = false
    let idle = false
    const subscriptions: Array<() => void> = []
    const finish = (complete: () => void) => {
      if (settled) {
        return
      }
      settled = true
      signal.removeEventListener('abort', onAbort)
      subscriptions.forEach(unsubscribe => unsubscribe())
      complete()
    }
    const onAbort = () => finish(() => reject(cancellationError()))
    const completeIfReady = () => {
      if (sendFinished && idle) {
        finish(() => resolve(response))
      }
    }
    subscriptions.push(
      session.onSessionError(data => {
        const error =
          getCopilotPaymentRequiredErrorFromSessionError(data) ??
          new Error(data.message, { cause: data })
        finish(() => reject(error))
      })
    )
    subscriptions.push(
      session.onAssistantMessage(event => {
        if (event.agentId === undefined) {
          response = event
        }
      })
    )
    subscriptions.push(
      session.onIdle(() => {
        idle = true
        completeIfReady()
      })
    )
    signal.addEventListener('abort', onAbort)
    if (signal.aborted) {
      onAbort()
      return
    }
    try {
      void session.send(options).then(
        () => {
          sendFinished = true
          completeIfReady()
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
