export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface ILogEntry {
  level: LogLevel
  readonly message: string
}
