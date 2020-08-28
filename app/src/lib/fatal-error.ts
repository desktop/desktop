/** Throw an error. */
export function fatalError(msg: string): never {
  throw new Error(msg)
}

/**
 * Utility function used to achieve exhaustive type checks at compile time.
 *
 * If the type system is bypassed or this method will throw an exception
 * using the second parameter as the message.
 *
 * @param x         Placeholder parameter in order to leverage the type
 *                  system. Pass the variable which has been type narrowed
 *                  in an exhaustive check.
 *
 * @param message   The message to be used in the runtime exception.
 *
 */
export function assertNever(x: never, message: string): never {
  throw new Error(message)
}

/**
 * Unwrap a value that, according to the type system, could be null or
 * undefined, but which we know is not. If the value _is_ null or undefined,
 * this will throw. The message should contain the rationale for knowing the
 * value is defined.
 */
export function forceUnwrap<T>(message: string, x: T | null | undefined): T {
  if (x == null) {
    return fatalError(message)
  } else {
    return x
  }
}

/**
 * Unwrap a value that, according to the type system, could be null or
 * undefined, but which we know is not. If the value _is_ null or undefined,
 * this will throw. The message should contain the rationale for knowing the
 * value is defined.
 */
export function assertNonNullable<T>(
  x: T,
  message: string
): asserts x is NonNullable<T> {
  if (x == null) {
    return fatalError(message)
  }
}
