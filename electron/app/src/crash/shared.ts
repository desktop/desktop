/**
 * We differentiate between errors that happens before we're
 * able to show the main renderer window and errors that happen
 * after that. Launch errors are special in that users aren't
 * even able to interact with the app. We use this information
 * to customize the presentation of the crash process.
 */
export type ErrorType = 'launch' | 'generic'

/**
 * An interface describing the nature of the error that caused
 * us to spawn the crash process.
 */
export interface ICrashDetails {
  /**
   * Whether this error was thrown before we were able to launch
   * the main renderer process or not. See the documentation for
   * the ErrorType type for more details.
   */
  readonly type: ErrorType

  /**
   * The error that caused us to spawn the crash process.
   */
  readonly error: Error
}
