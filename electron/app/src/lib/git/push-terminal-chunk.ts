import { coerceToString } from './coerce-to-string'

/**
 * Appends a chunk of terminal output to a buffer while maintaining a maximum capacity.
 *
 * This function manages a rolling buffer of terminal output (combined stdout and stderr)
 * by pushing new chunks and trimming from the beginning when the total character count
 * exceeds the specified capacity. This ensures memory-bounded storage of terminal output
 * for git operations.
 *
 * @param chunks - The array of string chunks representing the terminal output buffer.
 *                 This array is mutated in place.
 * @param capacity - The maximum number of characters to retain in the buffer.
 *                   Note: this is character count, not byte count.
 * @param chunk - The new chunk of terminal output to append, either as a Buffer or string.
 *
 * Intended to be used by git operations in core.ts to capture and limit terminal output.
 * When the buffer exceeds capacity, chunks are removed from the beginning (oldest first),
 * and partial chunks may be trimmed to fit exactly within the capacity limit.
 */
export const pushTerminalChunk = (
  chunks: string[],
  capacity: number,
  chunk: Buffer | string
) => {
  chunks.push(coerceToString(chunk))
  let terminalOutputLength = chunks.reduce((acc, cur) => acc + cur.length, 0)

  while (terminalOutputLength > capacity) {
    const firstChunk = chunks[0]
    const overrun = terminalOutputLength - capacity

    if (overrun >= firstChunk.length) {
      chunks.shift()
      terminalOutputLength -= firstChunk.length
    } else {
      chunks[0] = firstChunk.substring(overrun)
      terminalOutputLength -= overrun
    }
  }
}
