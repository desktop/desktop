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

/*
 * Write a file using the standard fs.writeFile API, but wrapped in a promise.
 *
 * @param path the path to the file on disk
 * @param data the contents of the file to write
 * @param options the default Fs.writeFile options
 */
export function writeFile(
  path: string,
  data: any,
  options: { encoding?: string; mode?: number; flag?: string } = {}
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    Fs.writeFile(path, data, options, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
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
    byline(stream).on('data', (buffer: Buffer) => {
      if (disposable.disposed) {
        return
      }

      const line = buffer.toString()
      cb(line)
    })
  })

  tailer.start()

  return new Disposable(() => {
    disposable.dispose()
    tailer.stop()
  })
}

/*
 * Helper function to promisify and simplify fs.stat.
 *
 * @param path Path to check for existence.
 */
export function pathExists(path: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    Fs.stat(path, (error, stats) => {
      if (error) {
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}

function open(path: string, flags: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    Fs.open(path, flags, (err, fd) => {
      if (err) {
        reject(err)
      } else {
        resolve(fd)
      }
    })
  })
}

function read(
  fd: number,
  buffer: Buffer,
  offset: number,
  length: number,
  position: number | null
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    Fs.read(fd, buffer, offset, length, position, (err, bytesRead, buffer) => {
      if (err) {
        reject(err)
      } else {
        resolve(bytesRead)
      }
    })
  })
}

function close(fd: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    Fs.close(fd, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
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
export async function readFile(
  filename: string,
  options?: { encoding: BufferEncoding; flag?: string }
): Promise<string>
export async function readFile(
  filename: string,
  options?: { encoding?: string; flag?: string }
): Promise<Buffer | string> {
  return new Promise<string | Buffer>((resolve, reject) => {
    options = options || { flag: 'r' }
    Fs.readFile(filename, options, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

const readBufferSize = 8 * 1024

export async function readPartialFile(
  path: string,
  maxLength: number
): Promise<Buffer> {
  if (maxLength <= 0) {
    throw new Error('maxLength must be greater than zero if given')
  }

  const readBuf = new Buffer(readBufferSize)
  const chunks = new Array<Buffer>()

  let total = 0

  const fd = await open(path, 'r')

  try {
    let c
    while ((c = await read(fd, readBuf, 0, readBuf.length, null)) > 0) {
      total += c
      chunks.push(Buffer.from(readBuf.slice(0, c)))

      if (maxLength !== undefined && total >= maxLength) {
        break
      }
    }
  } finally {
    close(fd)
  }

  return Buffer.concat(chunks, maxLength ? Math.min(total, maxLength) : total)
}
