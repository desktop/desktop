interface IErrnoException extends Error {
  readonly code: string
  readonly syscall: string
}

export function isErrnoException(err: any): err is IErrnoException {
  return (
    err instanceof Error &&
    typeof (err as any).code === 'string' &&
    typeof (err as any).syscall === 'string'
  )
}
