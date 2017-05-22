export type ErrorType = 'launch' | 'generic'

export interface ICrashDetails {
  readonly type: ErrorType
  readonly error: Error
}
