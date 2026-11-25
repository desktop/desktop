import * as Path from 'path'
import * as Fs from 'fs'
import sourceMapSupport from 'source-map-support'
import { fileURLToPath } from 'url'

/**
 * This array tells the source map logic which files that we can expect to
 * be able to resolve a source map for and they should reflect the chunks
 * entry names from our webpack config.
 *
 * Note that we explicitly don't enable source maps for the crash process
 * since it's possible that the error which caused us to spawn the crash
 * process was related to source maps.
 */
const knownFilesWithSourceMap = ['renderer.js', 'main.js']

function retrieveSourceMap(source: string) {
  // This is a happy path in case we know for certain that we won't be
  // able to resolve a source map for the given location.
  if (!knownFilesWithSourceMap.some(file => source.endsWith(file))) {
    return null
  }

  // We get a file uri when we're inside a renderer, convert to a path
  if (source.startsWith('file://')) {
    source = fileURLToPath(source)
  }

  // We store our source maps right next to the bundle
  const path = `${source}.map`

  if (__DEV__ && path.startsWith('http://')) {
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', path, false)
      xhr.send(null)
      if (xhr.readyState === 4 && xhr.status === 200) {
        return { url: Path.basename(path), map: xhr.responseText }
      }
    } catch {
      return null
    }
    return null
  }

  // We don't have an option here, see
  //  https://github.com/v8/v8/wiki/Stack-Trace-API#customizing-stack-traces
  // This happens on-demand when someone accesses the stack
  // property on an error object and has to be synchronous :/
  // eslint-disable-next-line no-sync
  if (!Fs.existsSync(path)) {
    return null
  }

  try {
    // eslint-disable-next-line no-sync
    const map = Fs.readFileSync(path, 'utf8')
    return { url: Path.basename(path), map }
  } catch {
    return null
  }
}

/** A map from errors to their stack frames. */
const stackFrameMap = new WeakMap<Error, ReadonlyArray<any>>()

/**
 * The `prepareStackTrace` that comes from the `source-map-support` module.
 * We'll use this when the user explicitly wants the stack source mapped.
 */
let prepareStackTraceWithSourceMap: (
  error: Error,
  frames: ReadonlyArray<any>
) => string

/**
 * Capture the error's stack frames and return a standard, un-source mapped
 * stack trace.
 */
function prepareStackTrace(error: Error, frames: ReadonlyArray<any>) {
  stackFrameMap.set(error, frames)

  // Ideally we'd use the default `Error.prepareStackTrace` here but it's
  // undefined so V8 must doing something fancy. Instead we'll do a decent
  // impression.
  return error + frames.map(frame => `\n    at ${frame}`).join('')
}

/** Enable source map support in the current process. */
export function enableSourceMaps() {
  sourceMapSupport.install({
    environment: 'node',
    handleUncaughtExceptions: false,
    retrieveSourceMap,
  })

  const AnyError = Error as any
  // We want to keep `source-map-support`s `prepareStackTrace` around to use
  // later, but our cheaper `prepareStackTrace` should be the default.
  prepareStackTraceWithSourceMap = AnyError.prepareStackTrace
  AnyError.prepareStackTrace = prepareStackTrace
}

const maxReportedObjectKeys = 10

function safeReadProperty(
  value: object,
  key: string
): { readonly found: boolean; readonly value: unknown } {
  try {
    if (!(key in value)) {
      return { found: false, value: undefined }
    }
    return { found: true, value: Reflect.get(value, key) }
  } catch {
    return { found: false, value: undefined }
  }
}

function getConstructorName(value: object): string | undefined {
  try {
    if (Object.getPrototypeOf(value) === null) {
      return undefined
    }

    const ctor = Reflect.get(value, 'constructor')
    if (typeof ctor === 'function' && ctor.name.length > 0) {
      return ctor.name
    }
  } catch {
    // Ignore throwing getters or proxies
  }

  return undefined
}

function describeObject(value: object): string {
  const label = getConstructorName(value) ?? '[null prototype]'

  try {
    if (typeof Event === 'function' && value instanceof Event) {
      return `${label} (type=${value.type})`
    }
  } catch {
    // Ignore cross-realm or proxy errors
  }

  try {
    const keys = Object.getOwnPropertyNames(value).sort()
    if (keys.length === 0) {
      return `${label} (no own properties)`
    }

    const shownKeys =
      keys.length > maxReportedObjectKeys
        ? `${keys.slice(0, maxReportedObjectKeys).join(', ')}, …`
        : keys.join(', ')

    return `${label} (keys: ${shownKeys})`
  } catch {
    return label
  }
}

function formatErrorName(error: object): string {
  const nameProp = safeReadProperty(error, 'name')
  if (
    nameProp.found &&
    typeof nameProp.value === 'string' &&
    nameProp.value.length > 0
  ) {
    return nameProp.value
  }

  return getConstructorName(error) ?? 'NonError'
}

function formatErrorMessage(error: object): string {
  const messageProp = safeReadProperty(error, 'message')
  if (!messageProp.found) {
    return describeObject(error)
  }

  const rawMessage = messageProp.value
  if (rawMessage === null) {
    return 'null'
  }

  if (rawMessage === undefined) {
    return 'undefined'
  }

  if (typeof rawMessage === 'string') {
    return rawMessage
  }

  if (typeof rawMessage === 'object') {
    try {
      return JSON.stringify(rawMessage, Object.getOwnPropertyNames(rawMessage))
    } catch {
      return describeObject(rawMessage)
    }
  }

  return String(rawMessage)
}

function formatErrorStack(error: object): string | undefined {
  if (error instanceof Error) {
    return sourceMappedStackTrace(error)
  }

  const stackProp = safeReadProperty(error, 'stack')
  return stackProp.found && typeof stackProp.value === 'string'
    ? stackProp.value
    : undefined
}

export interface ISourceLocation {
  readonly source: string
  readonly line: number
  readonly column?: number
}

/**
 * Resolve a 1-based line and optional 1-based column in a compiled bundle to
 * its original source map location, falling back to the input position when no
 * source map is available or mapping fails.
 */
export function mapSourceLocation(
  source: string,
  line: number,
  column?: number
): ISourceLocation {
  const hasColumn = column !== undefined && column > 0

  try {
    const mapped = sourceMapSupport.mapSourcePosition({
      source,
      line,
      column: hasColumn ? column - 1 : 0,
    })

    return {
      source: mapped.source,
      line: mapped.line,
      column: hasColumn ? mapped.column + 1 : undefined,
    }
  } catch {
    return {
      source,
      line,
      column: hasColumn ? column : undefined,
    }
  }
}

/**
 * Make a copy of the error with a source-mapped stack trace. If it couldn't
 * perform the source mapping, it'll use the original error stack.
 */
export function withSourceMappedStack(error: unknown): Error {
  // Guard against `throw "Foo"` which is totally a thing that can happen
  if (typeof error === 'string') {
    return {
      name: 'StringError',
      message: error,
    }
  }

  if (error === null) {
    return {
      name: 'NonError',
      message: 'null',
      stack: undefined,
    }
  }

  if (error === undefined) {
    return {
      name: 'NonError',
      message: 'undefined',
      stack: undefined,
    }
  }

  if (typeof error === 'function') {
    return {
      name: 'NonError',
      message:
        error.name.length > 0 ? `function ${error.name}` : 'anonymous function',
      stack: undefined,
    }
  }

  if (typeof error !== 'object') {
    return {
      name: 'NonError',
      message: `${typeof error}: ${String(error)}`,
      stack: undefined,
    }
  }

  return {
    name: formatErrorName(error),
    message: formatErrorMessage(error),
    stack: formatErrorStack(error),
  }
}

/** Get the source mapped stack trace for the error. */
function sourceMappedStackTrace(error: Error): string | undefined {
  let frames = stackFrameMap.get(error)

  if (!frames) {
    // At this point there's no guarantee that anyone has actually retrieved the
    // stack on this error which means that our custom prepareStackTrace handler
    // hasn't run and as a result of that we don't have the native frames stored
    // in our weak map. In order to get around that we'll eagerly access the
    // stack, forcing our handler to run which should ensure that the native
    // frames are stored in our weak map.
    ;(error.stack || '').toString()
    frames = stackFrameMap.get(error)
  }

  if (!frames) {
    return error.stack
  }

  return prepareStackTraceWithSourceMap(error, frames)
}
