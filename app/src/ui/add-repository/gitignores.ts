import * as Path from 'path'
import { readdir, writeFile, readFile } from 'fs-extra'

const GitIgnoreExtension = '.gitignore'

const root = Path.join(__dirname, 'static', 'gitignore')

let cachedGitIgnores: Map<string, string> | null = null

async function getCachedGitIgnores(): Promise<Map<string, string>> {
  if (cachedGitIgnores != null) {
    return cachedGitIgnores
  } else {
    const files = await readdir(root)
    const ignoreFiles = files.filter(file => file.endsWith(GitIgnoreExtension))

    cachedGitIgnores = new Map()
    for (const file of ignoreFiles) {
      cachedGitIgnores.set(
        Path.basename(file, GitIgnoreExtension),
        Path.join(root, file)
      )
    }

    return cachedGitIgnores
  }
}

/** Get the names of the available gitignores. */
export async function getGitIgnoreNames(): Promise<ReadonlyArray<string>> {
  const gitIgnores = await getCachedGitIgnores()
  return Array.from(gitIgnores.keys())
}

/** Get the gitignore based on a name from `getGitIgnoreNames()`. */
async function getGitIgnoreText(name: string): Promise<string> {
  const gitIgnores = await getCachedGitIgnores()

  const path = gitIgnores.get(name)
  if (!path) {
    throw new Error(
      `Unknown gitignore: ${name}. Only names returned from getGitIgnoreNames() can be used.`
    )
  }

  return await readFile(path, 'utf8')
}

/** Write the named gitignore to the repository. */
export async function writeGitIgnore(
  repositoryPath: string,
  name: string
): Promise<void> {
  const fullPath = Path.join(repositoryPath, '.gitignore')
  const text = await getGitIgnoreText(name)
  await writeFile(fullPath, text)
}
