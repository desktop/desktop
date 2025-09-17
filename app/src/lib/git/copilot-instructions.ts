import * as FS from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import * as Path from 'path'
import { Repository } from '../../models/repository'

/**
 * Read the contents of the repository .github/COPILOT.md file.
 *
 * Returns a promise which will either be rejected or resolved
 * with the contents of the file. If there's no copilot instructions file
 * in the repository the promise will resolve with null.
 */
export async function readCopilotInstructions(
  repository: Repository
): Promise<string | null> {
  const instructionsPath = Path.join(repository.path, '.github', 'COPILOT.md')

  return new Promise<string | null>((resolve, reject) => {
    FS.readFile(instructionsPath, 'utf8', (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          resolve(null)
        } else {
          reject(err)
        }
      } else {
        resolve(data)
      }
    })
  })
}

/**
 * Persist the given content to the repository .github/COPILOT.md file.
 *
 * If the repository doesn't contain a .github directory, one will be created.
 * If there's no copilot instructions file, one will be created, otherwise
 * the current file will be overwritten.
 */
export async function saveCopilotInstructions(
  repository: Repository,
  text: string
): Promise<void> {
  const githubDir = Path.join(repository.path, '.github')
  const instructionsPath = Path.join(githubDir, 'COPILOT.md')

  if (text === '') {
    return new Promise<void>((resolve, reject) => {
      FS.unlink(instructionsPath, err => {
        if (err && err.code !== 'ENOENT') {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  // Ensure .github directory exists
  try {
    await mkdir(githubDir, { recursive: true })
  } catch (err) {
    // Directory might already exist, ignore error
  }

  await writeFile(instructionsPath, text)
}
