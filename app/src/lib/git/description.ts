import * as Path from 'path'
import * as FSE from 'fs-extra'

const GitDescriptionPath = '.git/description'

const DefaultGitDescription =
  "Unnamed repository; edit this file 'description' to name the repository.\n"

/** Get the repository's description from the .git/description file. */
export async function getGitDescription(
  repositoryPath: string
): Promise<string> {
  const path = Path.join(repositoryPath, GitDescriptionPath)

  try {
    const data = await FSE.readFile(path, 'utf8')
    if (data === DefaultGitDescription) {
      return ''
    }
    return data
  } catch (err) {
    return ''
  }
}

/** Write a .git/description file to the repository. */
export async function writeGitDescription(
  repositoryPath: string,
  description: string
): Promise<void> {
  const fullPath = Path.join(repositoryPath, GitDescriptionPath)
  await FSE.writeFile(fullPath, description)
}
