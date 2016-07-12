/** Throw an error. */
export default function fatalError(msg: string): never {
  throw new Error(msg)
}
