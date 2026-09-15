import { Transform } from 'node:stream'

/**
 * Creates a transform stream which removes redundant Git progress output by
 * handling carriage returns the same way a terminal would, i.e by
 * moving the cursor and (potentially) overwriting text.
 *
 * Git (and many other CLI tools) use this trick to present the
 * user with nice looking progress. When writing something like...
 *
 * 'Downloading: 1%  \r'
 * 'Downloading: 2%  \r'
 *
 * ...to the terminal the user is gonna perceive it as if the 1 just
 * magically changes to a two.
 *
 * The carriage return character for all of you kids out there
 * that haven't yet played with a manual typewriter refers to the
 * "carriage" which held the character arms, see
 *
 *  https://en.wikipedia.org/wiki/Carriage_return#Typewriters
 */
export const createTerminalStream = () => {
  // The virtual line buffer, think of this as one long line (1 KiB) in a
  // terminal where `l` is the farthest we've written in that line and `p` is
  // the current cursor position, i.e. where we'll write the next characters
  let buf: Buffer, l: number, p: number

  function reset() {
    buf = Buffer.alloc(1024)
    p = l = 0
  }

  reset()

  return new Transform({
    decodeStrings: true,
    transform(chunk: Buffer, _, callback) {
      let i = 0
      let next, cr, lf

      while (i < chunk.length) {
        cr = chunk.indexOf(0x0d, i)

        if (cr === -1) {
          // Happy path, there's no carriage return so we can jump to the last
          // linefeed. Significant performance boost for streams without CRs.
          lf = chunk.subarray(i).lastIndexOf(0x0a)
          lf = lf === -1 ? -1 : lf + i
        } else {
          // Slow path, we need to look for the next linefeed to see if it comes
          // before or after the carriage return.
          lf = chunk.indexOf(0x0a, i)
        }

        // The next LF, CR, or the last index if we don't find either
        next = Math.min(
          cr === -1 ? chunk.length - 1 : cr,
          lf === -1 ? chunk.length - 1 : lf
        )
        next = next === -1 ? chunk.length - 1 : next

        let sliceLength
        let start = i
        const end = next + 1

        // Take the chunk and copy it into the buffer, if we can't fit it
        while ((sliceLength = end - start) > 0) {
          // Writing the chunk from the current cursor position will overflow
          // the "line" (buf). When this happens in a terminal the line will
          // wrap and the cursor will be moved to the next line. We simulate
          // this by pushing our current "line" (if any) and the chunk
          if (p + sliceLength > buf.length) {
            // It's possible that our cursor has just been reset to 0, in that
            // case we don't want to push because the chunk will "overwrite"
            // the content in our buf.
            if (p > 0) {
              this.push(buf.subarray(0, p))
            }

            // Push at most however many bytes is left on the "line"
            const remaining = buf.length - p
            this.push(chunk.subarray(start, start + remaining))
            start += remaining
            reset()
          } else {
            // We can fit the entire chunk into the buffer, so just copy it
            chunk.copy(buf, p, start)
            p += sliceLength
            // We may have written over only parts of the previous line
            // contents, for example, with this input:
            //  1. "foo bar\r"
            //  2. "baz"
            // the buffer should contain "baz bar"
            l = Math.max(p, l)
            break
          }
        }

        if (chunk[next] === 0x0a /* \n */ && l > 0) {
          // We found a line feed; push the current "line" and reset
          this.push(buf.subarray(0, l))
          reset()
        } else if (chunk[next] === 0x0d /* \r */) {
          // We found a carriage return, reset the cursor
          p = 0
        }

        i = next + 1
      }

      callback()
    },
    flush(callback) {
      callback(null, l > 0 ? buf.subarray(0, l) : null)
    },
  })
}
