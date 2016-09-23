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
 * @param {x}       Placeholder parameter in order to leverage the type
 *                  system. Pass the variable which has been type narrowed
 *                  in an exhaustive check.
 *
 * @param {message} The message to be used in the runtime exception.
 *
 */
export function assertNever(x: never, message: string): never {
  throw new Error(message)
}
