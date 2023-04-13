import * as Os from 'os'
import * as Path from 'path'
import { Disposable } from 'event-kit'
import { Tailer } from './tailer'
import byline from 'byline'
import { createReadStream } from 'fs'
import { mkdtemp } from 'fs/promises'

/**
 * Get a path to a temp file using the given name. Note that the file itself
 * will not be created.
 */
export async function getTempFilePath(name: string): Promise<string> {
  const tempDir = Path.join(Os.tmpdir(), `${name}-`)
  const directory = await mkdtemp(tempDir)
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

    createReadStream(path, { start, end })
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        total += chunk.length
      })
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks, total)))
  })
}
