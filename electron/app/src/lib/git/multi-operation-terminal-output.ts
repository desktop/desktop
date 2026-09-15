import noop from 'lodash/noop'
import {
  TerminalOutput,
  TerminalOutputCallback,
  TerminalOutputListener,
} from './core'
import { pushTerminalChunk } from './push-terminal-chunk'

/**
 * Creates a callback that aggregates terminal output from multiple Git
 * operations into a single stream.
 *
 * This function is useful when running multiple Git operations sequentially
 * where you want to present a unified terminal output view. It buffers output
 * from all operations and forwards them to upstream subscribers when requested.
 *
 * The callback maintains an internal buffer (default 256KB) and subscribes to
 * each Git operation's terminal output. When an upstream consumer requests the
 * output, it receives all previously buffered chunks followed by any new chunks
 * as they arrive.
 *
 * @param onTerminalOutputAvailable - The user provided callback which will
 *                                    receive the aggregated terminal output.
 * @returns A callback that can be passed to individual Git operations as the
 *          onTerminalOutputAvailable callback to capture their terminal output
 */
export const createMultiOperationTerminalOutputCallback = (
  onTerminalOutputAvailable: TerminalOutputCallback,
  capacity = 256 * 1024
): TerminalOutputCallback => {
  let outputStarted = false
  const chunks: string[] = []
  const upstreamSubscribers = new Set<(chunk: TerminalOutput) => void>()

  const push = (chunk: string | Buffer) => {
    if (!outputStarted) {
      onTerminalOutputAvailable(function (cb) {
        upstreamSubscribers.add(cb)
        chunks.forEach(c => cb(c))
        return { unsubscribe: () => upstreamSubscribers.delete(cb) }
      })
      outputStarted = true
    }

    pushTerminalChunk(chunks, capacity, chunk)
    upstreamSubscribers.forEach(cb => cb(chunk))
  }

  // Called by each Git operation when terminal output is available. We'll
  // subscribe immediately to capture output from all operations and then
  // forward it to upstream callbacks if/when requested.
  const cb = function (subscribe: TerminalOutputListener) {
    subscribe(c => {
      if (Array.isArray(c)) {
        chunks.forEach(push)
      } else {
        push(c)
      }
    })

    // We can't unsubscribe because the user might request terminal output in
    // the future and we need to buffer the output from all operations to
    // ensure we can present the entire output.
    return { unsubscribe: noop }
  }

  return cb
}
