/**
 * Message protocol between the renderer's Copilot SDK proxy
 * (`sdk-client.ts`) and the utility process that runs the real SDK
 * (`sdk-host.ts`).
 *
 * Each `CopilotClient` gets its own message port. Messages are sent with the
 * structured clone algorithm, so functions and errors are encoded explicitly:
 * functions become callback IDs that the other side calls back over the port,
 * and errors keep their name, message, stack and code.
 */

/** The object a call is made on: the client or one of its sessions. */
export type CopilotSdkCallTarget =
  | { readonly kind: 'client' }
  | { readonly kind: 'session'; readonly sessionId: string }

/** A serialized `Error`. */
export interface ICopilotSdkSerializedError {
  readonly name: string
  readonly message: string
  readonly stack?: string
  readonly code?: string | number
}

/** The outcome of a call or callback. */
export type CopilotSdkResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: ICopilotSdkSerializedError }

/** Messages sent from the renderer to the SDK host. */
export type CopilotSdkRequest =
  | { readonly type: 'init'; readonly options: unknown }
  | {
      readonly type: 'call'
      readonly id: number
      readonly target: CopilotSdkCallTarget
      readonly path: ReadonlyArray<string>
      readonly args: ReadonlyArray<unknown>
    }
  | {
      readonly type: 'callback-result'
      readonly id: number
      readonly result: CopilotSdkResult
    }

/** Messages sent from the SDK host to the renderer. */
export type CopilotSdkResponse =
  | {
      readonly type: 'result'
      readonly id: number
      readonly result: CopilotSdkResult
    }
  | {
      readonly type: 'event'
      readonly sessionId: string
      readonly event: unknown
    }
  | {
      readonly type: 'callback'
      readonly id: number
      readonly callbackId: number
      readonly args: ReadonlyArray<unknown>
    }

/** The value returned to the renderer in place of a `CopilotSession`. */
export interface ICopilotSdkSessionHandle {
  readonly sessionId: string
}

/** A message port, independent of the Electron, DOM or Node implementation. */
export interface ICopilotSdkChannel<TSend, TReceive> {
  send(message: TSend): void
  onMessage(listener: (message: TReceive) => void): void
  /** Called once when either side closes the port or its process exits. */
  onClose(listener: () => void): void
  close(): void
}

/** The renderer's end of a client's port. */
export type CopilotSdkClientChannel = ICopilotSdkChannel<
  CopilotSdkRequest,
  CopilotSdkResponse
>

/** The SDK host's end of a client's port. */
export type CopilotSdkHostChannel = ICopilotSdkChannel<
  CopilotSdkResponse,
  CopilotSdkRequest
>

/** The message the SDK host sends its parent when it has no open ports. */
export interface ICopilotSdkHostIdleMessage {
  readonly type: 'idle'
  /** How many ports the host has received so far. */
  readonly received: number
}

const CallbackKey = '__copilotSdkCallback'
const ErrorKey = '__copilotSdkError'

/** Serialize an error, keeping the properties Desktop relies on. */
export function serializeCopilotSdkError(
  error: unknown
): ICopilotSdkSerializedError {
  if (!(error instanceof Error)) {
    return { name: 'Error', message: String(error) }
  }
  const code: unknown = (error as { code?: unknown }).code
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code:
      typeof code === 'string' || typeof code === 'number' ? code : undefined,
  }
}

/** Recreate an error serialized with {@link serializeCopilotSdkError}. */
export function deserializeCopilotSdkError(
  error: ICopilotSdkSerializedError
): Error {
  const result = new Error(error.message)
  result.name = error.name
  if (error.stack !== undefined) {
    result.stack = error.stack
  }
  return error.code === undefined
    ? result
    : Object.assign(result, { code: error.code })
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** A function passed across the port as a callback marker. */
export type CopilotSdkCallback = (...args: ReadonlyArray<unknown>) => unknown

function isCopilotSdkCallback(value: unknown): value is CopilotSdkCallback {
  return typeof value === 'function'
}

/**
 * Encode a value so that it can be posted to a message port.
 *
 * Functions are replaced with callback markers using `registerCallback`, or
 * dropped when it's not given. Errors are serialized. Arrays and plain
 * objects are encoded recursively; anything else is left to structured clone.
 */
export function encodeCopilotSdkValue(
  value: unknown,
  registerCallback?: (callback: CopilotSdkCallback) => number
): unknown {
  if (isCopilotSdkCallback(value)) {
    return registerCallback === undefined
      ? undefined
      : { [CallbackKey]: registerCallback(value) }
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (value instanceof Error) {
    return { [ErrorKey]: serializeCopilotSdkError(value) }
  }
  if (Array.isArray(value)) {
    return value.map(v => encodeCopilotSdkValue(v, registerCallback))
  }
  if (!isPlainObject(value)) {
    return value
  }
  const result: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    result[key] = encodeCopilotSdkValue(v, registerCallback)
  }
  return result
}

/** Decode a value encoded with {@link encodeCopilotSdkValue}. */
export function decodeCopilotSdkValue(
  value: unknown,
  createCallback: (callbackId: number) => CopilotSdkCallback
): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(v => decodeCopilotSdkValue(v, createCallback))
  }
  if (!isPlainObject(value)) {
    return value
  }
  const callbackId = value[CallbackKey]
  if (typeof callbackId === 'number') {
    return createCallback(callbackId)
  }
  const error = value[ErrorKey]
  if (typeof error === 'object' && error !== null) {
    return deserializeCopilotSdkError(error as ICopilotSdkSerializedError)
  }
  const result: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    result[key] = decodeCopilotSdkValue(v, createCallback)
  }
  return result
}

/** Settle a call or callback, serializing its rejection. */
export async function getCopilotSdkResult(
  operation: () => unknown,
  encode: (value: unknown) => unknown
): Promise<CopilotSdkResult> {
  try {
    return { ok: true, value: encode(await operation()) }
  } catch (error) {
    return { ok: false, error: serializeCopilotSdkError(error) }
  }
}
