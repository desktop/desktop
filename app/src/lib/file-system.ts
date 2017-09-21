import * as Fs from 'fs-extra'

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
