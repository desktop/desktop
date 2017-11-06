import * as Path from 'path'
import * as Fs from 'fs'

const GitDescriptionPath = '.git/description'

const DefaultGitDescription =
  "Unnamed repository; edit this file 'description' to name the repository.\n"

/** Get the repository's description from the .git/description file. */
export async function getGitDescription(
  repositoryPath: string
): Promise<string> {
  const path = Path.join(repositoryPath, GitDescriptionPath)

  return new Promise<string>((resolve, reject) => {
    Fs.readFile(path, 'utf8', (err, data) => {
      if (err) {
        /** No .git/description file existed, just return an empty one. */
        resolve('')
        return
      }

      if (data === DefaultGitDescription) {
        resolve('')
        return
      }

      resolve(data)
    })
  })
}

/** Write a .git/description file to the repository. */
export async function writeGitDescription(
  repositoryPath: string,
  description: string
): Promise<void> {
  const fullPath = Path.join(repositoryPath, GitDescriptionPath)

  return new Promise<void>((resolve, reject) => {
    Fs.writeFile(fullPath, description, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}
