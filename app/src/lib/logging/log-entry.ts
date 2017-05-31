export interface ILogEntry {
  level: 'error' | 'warn' | 'info' | 'debug'
  readonly message: string
}
