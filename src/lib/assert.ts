export default function assert(msg: string): never {
  throw new Error(msg)
}
