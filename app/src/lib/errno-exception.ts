interface IErrnoException extends Error {
  readonly code: string
  readonly syscall: string
}
