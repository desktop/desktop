import {
  ISourceLocation,
  mapSourceLocation,
  withSourceMappedStack,
} from '../../lib/source-map-support'

const resizeObserverLoopMessages: ReadonlySet<string> = new Set([
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
])

type SourceLocationMapper = (
  source: string,
  line: number,
  column?: number
) => ISourceLocation

interface IProcessErrorEmitter {
  listenerCount(eventName: 'uncaughtException'): number
  emit(eventName: 'uncaughtException', error: Error): boolean
}

/**
 * Whether an uncaught renderer error is a benign Chromium ResizeObserver
 * loop notification rather than an application crash.
 */
export function isResizeObserverLoopError(error: unknown): boolean {
  if (typeof error === 'string') {
    return resizeObserverLoopMessages.has(error)
  }

  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return resizeObserverLoopMessages.has(error.message)
  }

  return false
}

function createSyntheticError(
  name: string,
  message: string,
  stack: string | undefined
): Error {
  const error = new Error(message)
  error.name = name
  // Overwrite before reading `.stack` so V8 replaces its lazy stack getter
  // instead of capturing a misleading stack pointing at window.onerror.
  error.stack = stack
  return error
}

function formatWindowErrorStack(
  name: string,
  message: string,
  source: string | undefined,
  lineno: number | undefined,
  colno: number | undefined,
  mapLocation: SourceLocationMapper
): string | undefined {
  if (!source || lineno === undefined || lineno <= 0) {
    return undefined
  }

  const mapped = mapLocation(source, lineno, colno)
  const location =
    mapped.column !== undefined
      ? `${mapped.source}:${mapped.line}:${mapped.column}`
      : `${mapped.source}:${mapped.line}`

  return `${name}: ${message}\n    at ${location}`
}

function extractWindowErrorMessage(eventOrMessage: Event | string): string {
  if (typeof eventOrMessage === 'string') {
    return eventOrMessage
  }

  if (
    typeof ErrorEvent === 'function' &&
    eventOrMessage instanceof ErrorEvent
  ) {
    return eventOrMessage.message
  }

  return ''
}

/**
 * Convert `window.onerror` arguments into an `Error` that preserves the error
 * message and source-mapped script location when Chromium passes `null`,
 * `undefined`, or a non-Error value (such as `ResizeObserver loop completed
 * with undelivered notifications.`, which dispatches with `error === null`).
 *
 * Electron's built-in renderer `window.onerror` handler forwards only the
 * `error` argument to `process.emit('uncaughtException', error)`, discarding
 * `message`, `source`, `lineno`, and `colno`.
 */
export function normalizeWindowError(
  eventOrMessage: Event | string,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: unknown,
  mapLocation: SourceLocationMapper = mapSourceLocation
): Error {
  if (error instanceof Error) {
    return error
  }

  if (error !== null && error !== undefined) {
    const normalized = withSourceMappedStack(error)
    const stack =
      normalized.stack ??
      formatWindowErrorStack(
        normalized.name,
        normalized.message,
        source,
        lineno,
        colno,
        mapLocation
      )

    return createSyntheticError(normalized.name, normalized.message, stack)
  }

  const rawMessage = extractWindowErrorMessage(eventOrMessage)
  if (rawMessage.length > 0) {
    const stack = formatWindowErrorStack(
      'Error',
      rawMessage,
      source,
      lineno,
      colno,
      mapLocation
    )

    return createSyntheticError('Error', rawMessage, stack)
  }

  const fallback = withSourceMappedStack(error)
  const stack = formatWindowErrorStack(
    fallback.name,
    fallback.message,
    source,
    lineno,
    colno,
    mapLocation
  )

  return createSyntheticError(fallback.name, fallback.message, stack)
}

/**
 * Replace Electron's default renderer `window.onerror` bridge with one that
 * preserves `message` and script location when `error` is missing or not an
 * `Error` instance.
 */
export function installWindowErrorHandler(
  targetWindow: Pick<Window, 'onerror'> = window,
  targetProcess: IProcessErrorEmitter = process,
  mapLocation: SourceLocationMapper = mapSourceLocation
): void {
  targetWindow.onerror = (message, source, lineno, colno, error) => {
    if (targetProcess.listenerCount('uncaughtException') > 0) {
      targetProcess.emit(
        'uncaughtException',
        normalizeWindowError(message, source, lineno, colno, error, mapLocation)
      )
      return true
    }

    return false
  }
}
