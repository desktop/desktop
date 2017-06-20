import * as fileSystem from 'fs-extra'
import ErrnoException = NodeJS.ErrnoException;

interface errorCallbackType { (err: ErrnoException): void}


/** this function wraps the filesystem mkdir function and silently returns if
 * the directory already exists. If a different error was thrown, it's passed to an error handling callback
 *
 * @param directoryPath the path of the directory the user wants to create
 * @param errorCallback function to be called in the event of an unexpected error
 */
export function mkdirIfNeeded (directoryPath: string, errorCallback: errorCallbackType) {
  fileSystem.mkdir(directoryPath, (err) => {
    if (err && err.code !== 'EEXIST') {
      errorCallback(err)
      return
    }
  })
}