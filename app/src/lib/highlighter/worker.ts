import { ITokens, IHighlightRequest } from './types'
import { encodePathAsUrl } from '../../lib/path'

const highlightWorkers = new Array<Worker>()
const maxIdlingWorkers = 2
const workerMaxRunDuration = 5 * 1000
const workerUri = encodePathAsUrl(__dirname, 'highlighter.js')

/**
 * Request an automatic detection of the language and highlight
 * the contents provided.
 *
 * @param contents  The actual contents which is to be used for
 *                  highlighting.
 * @param basename  The file basename of the path in question as returned
 *                  by node's basename() function (i.e. without a leading dot).
 * @param extension The file extension of the path in question as returned
 *                  by node's extname() function (i.e. with a leading dot).
 * @param tabSize   The width of a tab character. Defaults to 4. Used by the
 *                  stream to count columns. See CodeMirror's StringStream
 *                  class for more details.
 * @param lines     An optional filter of lines which needs to be tokenized.
 *
 *                  If undefined or empty all lines will be tokenized
 *                  and returned. By passing an explicit set of lines we can
 *                  both minimize the size of the response object (which needs
 *                  to be serialized over the IPC boundary) and, for stateless
 *                  modes we can significantly speed up the highlight process.
 */
export function highlight(
  contents: string,
  basename: string,
  extension: string,
  tabSize: number,
  lines: Array<number>
): Promise<ITokens> {
  // Bail early if there's no content to highlight or if we don't
  // need any lines from this file.
  if (!contents.length || !lines.length) {
    return Promise.resolve({})
  }

  // Get an idle worker or create a new one if none exist.
  const worker = highlightWorkers.shift() || new Worker(workerUri)

  return new Promise<ITokens>((resolve, reject) => {
    let timeout: null | number = null

    const clearTimeout = () => {
      if (timeout) {
        window.clearTimeout(timeout)
        timeout = null
      }
    }

    worker.onerror = ev => {
      clearTimeout()
      worker.terminate()
      reject(ev.error || new Error(ev.message))
    }

    worker.onmessage = ev => {
      clearTimeout()
      if (highlightWorkers.length < maxIdlingWorkers) {
        highlightWorkers.push(worker)
      } else {
        worker.terminate()
      }
      resolve(ev.data as ITokens)
    }

    const request: IHighlightRequest = {
      contents,
      basename,
      extension,
      tabSize,
      lines,
      addModeClass: true,
    }

    worker.postMessage(request)

    timeout = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('timed out'))
    }, workerMaxRunDuration)
  })
}
