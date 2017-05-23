import * as FS from 'fs'
import * as Path from 'path'

const DefaultReadmeName = 'README.md'

function defaultReadmeContents(name: string): string {
  return `# ${name}\n`
}

/**
 * Write the default README to the repository with the given name at the path.
 */
export function writeDefaultReadme(path: string, name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const fullPath = Path.join(path, DefaultReadmeName)
    const contents = defaultReadmeContents(name)
    FS.writeFile(fullPath, contents, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}
