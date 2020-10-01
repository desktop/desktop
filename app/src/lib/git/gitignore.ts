import * as Path from 'path'
import * as FS from 'fs'
import { Repository } from '../../models/repository'
import { getConfigValue } from './config'

/**
 * Read the contents of the repository .gitignore.
 *
 * Returns a promise which will either be rejected or resolved
 * with the contents of the file. If there's no .gitignore file
 * in the repository root the promise will resolve with null.
 */
export async function readGitIgnoreAtRoot(
  repository: Repository
): Promise<string | null> {
  const ignorePath = Path.join(repository.path, '.gitignore')

  return new Promise<string | null>((resolve, reject) => {
    FS.readFile(ignorePath, 'utf8', (err, data) => {
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
 * Persist the given content to the repository root .gitignore.
 *
 * If the repository root doesn't contain a .gitignore file one
 * will be created, otherwise the current file will be overwritten.
 */
export async function saveGitIgnore(
  repository: Repository,
  text: string
): Promise<void> {
  const ignorePath = Path.join(repository.path, '.gitignore')

  if (text === '') {
    return new Promise<void>((resolve, reject) => {
      FS.unlink(ignorePath, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  const fileContents = await formatGitIgnoreContents(text, repository)
  return new Promise<void>((resolve, reject) => {
    FS.writeFile(ignorePath, fileContents, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

/** Add the given pattern or patterns to the root gitignore file */
export async function appendIgnoreRule(
  repository: Repository,
  patterns: string | string[]
): Promise<void> {
  const text = (await readGitIgnoreAtRoot(repository)) || ''

  const currentContents = await formatGitIgnoreContents(text, repository)

  const newPatternText =
    patterns instanceof Array ? patterns.join('\n') : patterns
  const newText = await formatGitIgnoreContents(
    `${currentContents}${newPatternText}`,
    repository
  )

  await saveGitIgnore(repository, newText)
}

/**
 * Format the gitignore text based on the current config settings.
 *
 * This setting looks at core.autocrlf to decide which line endings to use
 * when updating the .gitignore file.
 *
 * If core.safecrlf is also set, adding this file to the index may cause
 * Git to return a non-zero exit code, leaving the working directory in a
 * confusing state for the user. So we should reformat the file in that
 * case.
 *
 * @param text The text to format.
 * @param repository The repository associated with the gitignore file.
 */
async function formatGitIgnoreContents(
  text: string,
  repository: Repository
): Promise<string> {
  const autocrlf = await getConfigValue(repository, 'core.autocrlf')
  const safecrlf = await getConfigValue(repository, 'core.safecrlf')

  return new Promise<string>((resolve, reject) => {
    if (autocrlf === 'true' && safecrlf === 'true') {
      // based off https://stackoverflow.com/a/141069/1363815
      const normalizedText = text.replace(/\r\n|\n\r|\n|\r/g, '\r\n')
      resolve(normalizedText)
      return
    }

    if (text.endsWith('\n')) {
      resolve(text)
      return
    }

    if (autocrlf == null) {
      // fallback to Git default behaviour
      resolve(`${text}\n`)
    } else {
      const linesEndInCRLF = autocrlf === 'true'
      if (linesEndInCRLF) {
        resolve(`${text}\n`)
      } else {
        resolve(`${text}\r\n`)
      }
    }
  })
}
