/**
 * A type describing a specific type of errors thrown by Node.js
 * when encountering errors in low-level operations (such as IO, network,
 * processes) containing additional information related to the error
 * itself.
 */
interface IErrnoException extends Error {
  /**
   * The string name for a numeric error code that comes from a Node.js API.
   * See https://nodejs.org/api/util.html#util_util_getsystemerrorname_err
   */
  readonly code: string

  /**
   * The "system call" (i.e. the Node abstraction) such as 'spawn', 'open', etc
   * which was responsible for triggering the exception.
   *
   * See https://github.com/nodejs/node/blob/v10.16.0/lib/internal/errors.js#L333-L351
   */
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
