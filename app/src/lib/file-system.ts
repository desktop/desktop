import * as FSE from 'fs-extra'
import * as Os from 'os'
import * as Path from 'path'
import { Disposable } from 'event-kit'
import { Tailer } from './tailer'
import byline from 'byline'

/**
 * Get a path to a temp file using the given name. Note that the file itself
 * will not be created.
 */
export async function getTempFilePath(name: string): Promise<string> {
  const tempDir = Path.join(Os.tmpdir(), `${name}-`)
  const directory = await FSE.mkdtemp(tempDir)
  return Path.join(directory, name)
}

/**
 * Tail the file and call the callback on every line.
 *
 * Note that this will not stop tailing until the returned `Disposable` is
 * disposed of.
 */
export function tailByLine(
  path: string,
  cb: (line: string) => void
): Disposable {
  const tailer = new Tailer(path)

  const onErrorDisposable = tailer.onError(error => {
    log.warn(`Unable to tail path: ${path}`, error)
  })

  const onDataDisposable = tailer.onDataAvailable(stream => {
    byline(stream).on('data', (buffer: Buffer) => {
      if (onDataDisposable.disposed) {
        return
      }

      const line = buffer.toString()
      cb(line)
    })
  })

  tailer.start()

  return new Disposable(() => {
    onDataDisposable.dispose()
    onErrorDisposable.dispose()
    tailer.stop()
  })
}

/**
 * Asynchronous readFile - Asynchronously reads the entire contents of a file.
 *
 * @param fileName
 * @param options An object with optional {encoding} and {flag} properties.  If {encoding} is specified, readFile returns a string; otherwise it returns a Buffer.
 * @param callback - The callback is passed two arguments (err, data), where data is the contents of the file.
 */
export async function readFile(
  filename: string,
  options?: { flag?: string }
): Promise<Buffer>
// eslint-disable-next-line no-redeclare
export async function readFile(
  filename: string,
  options?: { encoding: BufferEncoding; flag?: string }
): Promise<string>
// eslint-disable-next-line no-redeclare
export async function readFile(
  filename: string,
  options?: { encoding?: string; flag?: string }
): Promise<Buffer | string> {
  return new Promise<string | Buffer>((resolve, reject) => {
    options = options || { flag: 'r' }
    FSE.readFile(filename, options, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

/**
 * Read a specific region from a file.
 *
 * @param path  Path to the file
 * @param start First index relative to the start of the file to
 *              read from
 * @param end   Last index (inclusive) relative to the start of the
 *              file to read to
 */
export async function readPartialFile(
  path: string,
  start: number,
  end: number
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks = new Array<Buffer>()
    let total = 0

    FSE.createReadStream(path, { start, end })
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        total += chunk.length
      })
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks, total)))
  })
}
