/* eslint-disable @typescript-eslint/naming-convention */
/** Is the app running in dev mode? */
declare const __DEV__: boolean

/** The OAuth client id the app should use */
declare const __OAUTH_CLIENT_ID__: string | undefined

/** The OAuth secret the app should use. */
declare const __OAUTH_SECRET__: string | undefined

/** Is the app being built to run on Darwin? */
declare const __DARWIN__: boolean

/** Is the app being built to run on Win32? */
declare const __WIN32__: boolean

/** Is the app being built to run on Linux? */
declare const __LINUX__: boolean

/**
 * The product name of the app, this is intended to be a compile-time
 * replacement for app.getName
 * (https://www.electronjs.org/docs/latest/api/app#appgetname)
 */
declare const __APP_NAME__: string

/**
 * The current version of the app, this is intended to be a compile-time
 * replacement for app.getVersion
 * (https://www.electronjs.org/docs/latest/api/app#appgetname)
 */
declare const __APP_VERSION__: string

/**
 * The commit id of the repository HEAD at build time.
 * Represented as a 40 character SHA-1 hexadecimal digest string.
 */
declare const __SHA__: string

/** The channel for which the release was created. */
declare const __RELEASE_CHANNEL__:
  | 'production'
  | 'beta'
  | 'test'
  | 'development'

declare const __CLI_COMMANDS__: ReadonlyArray<string>

/** The URL for Squirrel's updates. */
declare const __UPDATES_URL__: string

/**
 * The currently executing process kind, this is specific to desktop
 * and identifies the processes that we have.
 */
declare const __PROCESS_KIND__: 'main' | 'ui' | 'crash' | 'highlighter'

interface IDesktopLogger {
  /**
   * Writes a log message at the 'error' level.
   *
   * The error will be persisted to disk as long as the disk transport is
   * configured to pass along log messages at this level. For more details
   * about the on-disk transport, see log.ts in the main process.
   *
   * If used from a renderer the log message will also be appended to the
   * devtools console.
   *
   * @param message The text to write to the log file
   * @param error   An optional error instance that will be formatted to
   *                include the stack trace (if one is available) and
   *                then appended to the log message.
   */
  error(message: string, error?: Error): void

  /**
   * Writes a log message at the 'warn' level.
   *
   * The error will be persisted to disk as long as the disk transport is
   * configured to pass along log messages at this level. For more details
   * about the on-disk transport, see log.ts in the main process.
   *
   * If used from a renderer the log message will also be appended to the
   * devtools console.
   *
   * @param message The text to write to the log file
   * @param error   An optional error instance that will be formatted to
   *                include the stack trace (if one is available) and
   *                then appended to the log message.
   */
  warn(message: string, error?: Error): void

  /**
   * Writes a log message at the 'info' level.
   *
   * The error will be persisted to disk as long as the disk transport is
   * configured to pass along log messages at this level. For more details
   * about the on-disk transport, see log.ts in the main process.
   *
   * If used from a renderer the log message will also be appended to the
   * devtools console.
   *
   * @param message The text to write to the log file
   * @param error   An optional error instance that will be formatted to
   *                include the stack trace (if one is available) and
   *                then appended to the log message.
   */
  info(message: string, error?: Error): void

  /**
   * Writes a log message at the 'debug' level.
   *
   * The error will be persisted to disk as long as the disk transport is
   * configured to pass along log messages at this level. For more details
   * about the on-disk transport, see log.ts in the main process.
   *
   * If used from a renderer the log message will also be appended to the
   * devtools console.
   *
   * @param message The text to write to the log file
   * @param error   An optional error instance that will be formatted to
   *                include the stack trace (if one is available) and
   *                then appended to the log message.
   */
  debug(message: string, error?: Error): void
}

declare const log: IDesktopLogger
// these changes should be pushed into the Electron declarations

declare namespace NodeJS {
  interface Process extends EventEmitter {
    on(
      event: 'send-non-fatal-exception',
      listener: (error: Error, context?: { [key: string]: string }) => void
    ): this
    emit(
      event: 'send-non-fatal-exception',
      error: Error,
      context?: { [key: string]: string }
    ): this
    removeListener(event: 'exit', listener: Function): this
  }
}

declare namespace Electron {
  type AppleActionOnDoubleClickPref = 'Maximize' | 'Minimize' | 'None'

  interface SystemPreferences {
    getUserDefault(
      key: 'AppleActionOnDoubleClick',
      type: 'string'
    ): AppleActionOnDoubleClickPref
  }
}

// https://github.com/microsoft/TypeScript/issues/21568#issuecomment-362473070
interface Window {
  Element: typeof Element
}

interface HTMLDialogElement {
  showModal: () => void
}
/**
 * Obtain the number of elements of a tuple type
 *
 * See https://itnext.io/implementing-arithmetic-within-typescripts-type-system-a1ef140a6f6f
 */
type Length<T extends any[]> = T extends { length: infer L } ? L : never

/** Obtain the the number of parameters of a function type */
type ParameterCount<T extends (...args: any) => any> = Length<Parameters<T>>
