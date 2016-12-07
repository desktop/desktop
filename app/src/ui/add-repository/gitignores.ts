import * as Path from 'path'
import * as Fs from 'fs'

const GitIgnoreExtension = '.gitignore'

const root = Path.join(__dirname, 'static', 'gitignore')

let cachedGitIgnores: Map<string, string> | null = null

function getCachedGitIgnores(): Promise<Map<string, string>> {
  if (cachedGitIgnores) {
    return Promise.resolve(cachedGitIgnores)
  } else {
    return new Promise((resolve, reject) => {
      Fs.readdir(root, (err, files) => {
        if (err) {
          reject(err)
        } else {
          const ignoreFiles = files.filter(file => file.endsWith(GitIgnoreExtension))

          cachedGitIgnores = new Map()
          for (const file of ignoreFiles) {
            cachedGitIgnores.set(Path.basename(file, GitIgnoreExtension), file)
          }

          resolve(cachedGitIgnores)
        }
      })
    })
  }
}

/** Get the names of the available gitignores. */
export async function getGitIgnoreNames(): Promise<ReadonlyArray<string>> {
  const gitIgnores = await getCachedGitIgnores()
  return Array.from(gitIgnores.keys())
}

/** Get the gitignore based on a name from `getGitIgnoreNames()`. */
export async function getGitIgnore(name: string): Promise<string> {
  const gitIgnores = await getCachedGitIgnores()

  return new Promise<string>((resolve, reject) => {
    const path = gitIgnores.get(name)
    if (!path) {
      reject(new Error(`Unknown gitignore: ${name}. Only names returned from getGitIgnoreNames() can be used.`))
      return
    }

    Fs.readFile(path, 'utf8', (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}
