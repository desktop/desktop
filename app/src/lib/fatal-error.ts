/** Throw an error. */
export function fatalError(msg: string): never {
  throw new Error(msg)
}
