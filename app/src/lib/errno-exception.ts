interface IErrnoException extends Error {
  readonly code: string
  readonly syscall: string
}

/**
 * Determine whether the given object conforms to the shape of an
 * internal Node.js low-level exception, see IErrnoException for
 * more details.
 */
export function isErrnoException(err: any): err is IErrnoException {
  return (
    err instanceof Error &&
    typeof (err as any).code === 'string' &&
    typeof (err as any).syscall === 'string'
  )
}
