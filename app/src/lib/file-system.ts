import * as fileSystem from 'fs-extra'


/** this function wraps the filesystem mkdir function and silently returns if
 * the directory already exists. If it does not, it makes the directory.
 * If a different error was thrown, it's passed to an error handling callback
 *
 * @param directoryPath the path of the directory the user wants to create
 */
export function mkdirIfNeeded (directoryPath: string) {
  return new Promise<void>((resolve, reject) => {
    fileSystem.mkdir(directoryPath, (err) => {
      if (err && err.code !== 'EEXIST') {
        reject(err)
        return
      }
      resolve()
    })
  })
}
