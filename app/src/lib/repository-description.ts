import * as Path from 'path'
import * as Fs from 'fs'

const GitDescriptionPath = '.git/description'

const DefaultGitDescription =
  "Unnamed repository; edit this file 'description' to name the repository.\n"

/** Get the repository's description from the .git/description file. */
export function getGitDescription(repositoryPath: string): string {
  const path = Path.join(repositoryPath, GitDescriptionPath)

  try {
    const description = Fs.readFileSync(path, 'utf8')

    if (description && description !== DefaultGitDescription) {
      return description
    } else {
      return ''
    }
  } catch (e) {
    /** The .git/description file probably didn't exist. */
    return ''
  }
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
