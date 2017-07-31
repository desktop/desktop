import * as Fs from 'fs-extra'
import * as Os from 'os'
import * as Path from 'path'
import { Disposable } from 'event-kit'
import { Tailer } from './tailer'

const byline = require('byline')

/** Create directory using basic Fs.mkdir but ignores
 * the error thrown when directory already exists.
 * All other errors must be handled by caller.
 *
 * @param directoryPath the path of the directory the caller wants to create.
 */
export function mkdirIfNeeded(directoryPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    Fs.mkdir(directoryPath, err => {
      if (err && err.code !== 'EEXIST') {
        reject(err)
        return
      }
      resolve()
    })
  })
}

/**
 * Get a path to a temp file using the given name. Note that the file itself
 * will not be created.
 */
export function getTempFilePath(name: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const tempDir = Path.join(Os.tmpdir(), `${name}-`)
    Fs.mkdtemp(tempDir, (err, directory) => {
      if (err) {
        reject(err)
      } else {
        const fullPath = Path.join(directory, name)
        resolve(fullPath)
      }
    })
  })
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
  const disposable = tailer.onDataAvailable(stream => {
    byline(stream).on('data', (line: string) => {
      if (disposable.disposed) {
        return
      }

      cb(line)
    })
  })

  return new Disposable(() => {
    disposable.dispose()
    tailer.stop()
  })
}
