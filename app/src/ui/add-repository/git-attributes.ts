import * as FS from 'fs'
import * as Path from 'path'

/**
 * Write the .gitAttributes file to the given repository
 */
export function writeGitAttributes(path: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const fullPath = Path.join(path, '.gitattributes')
    const contents = '# Auto detect text files and perform LF normalization\n* text=auto'

    FS.writeFile(fullPath, contents, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}
