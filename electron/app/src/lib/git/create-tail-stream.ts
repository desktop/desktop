import assert from 'assert'
import { Transform, TransformOptions } from 'stream'

type Options = Pick<TransformOptions, 'autoDestroy' | 'emitClose' | 'encoding'>

export function createTailStream(capacity: number, options?: Options) {
  assert.ok(capacity > 0, 'The "capacity" argument must be greater than 0')

  const chunks: Buffer[] = []
  let length = 0

  return new Transform({
    ...options,
    decodeStrings: true,
    transform(chunk, _, cb) {
      chunks.push(chunk)
      length += chunk.length

      while (length > capacity) {
        const firstChunk = chunks[0]
        const overrun = length - capacity

        if (overrun >= firstChunk.length) {
          chunks.shift()
          length -= firstChunk.length
        } else {
          chunks[0] = firstChunk.subarray(overrun)
          length -= overrun
        }
      }

      cb()
    },
    flush: cb => cb(null, Buffer.concat(chunks)),
  })
}
