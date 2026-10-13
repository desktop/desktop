import * as Path from 'path'
import * as FS from 'fs'
import { Repository } from '../../models/repository'
import { getConfigValue } from './config'
import { lstat, open, type FileHandle } from 'fs/promises'
import { isErrnoException } from '../errno-exception'

const symbolicLinkErrorMessage =
  'Cannot use a symbolic link as the root .gitignore file'

function createSymbolicLinkError(): Error {
  return new Error(symbolicLinkErrorMessage)
}

async function ensureGitIgnoreIsNotSymbolicLink(
  ignorePath: string
): Promise<void> {
  try {
    const stats = await lstat(ignorePath)
    if (stats.isSymbolicLink()) {
      throw createSymbolicLinkError()
    }
  } catch (error) {
    if (!isErrnoException(error) || error.code !== 'ENOENT') {
      throw error
    }
  }
}

async function openExistingGitIgnore(
  ignorePath: string,
  flags: number
): Promise<FileHandle | null> {
  let file: FileHandle

  try {
    file = await open(ignorePath, flags | FS.constants.O_NOFOLLOW)
  } catch (error) {
    if (isErrnoException(error)) {
      if (error.code === 'ENOENT') {
        await ensureGitIgnoreIsNotSymbolicLink(ignorePath)
        return null
      }

      if (error.code === 'ELOOP') {
        throw createSymbolicLinkError()
      }
    }

    throw error
  }

  try {
    const [fileStats, pathStats] = await Promise.all([
      file.stat(),
      lstat(ignorePath),
    ])

    if (
      pathStats.isSymbolicLink() ||
      fileStats.dev !== pathStats.dev ||
      fileStats.ino !== pathStats.ino
    ) {
      throw createSymbolicLinkError()
    }

    return file
  } catch (error) {
    await file.close()
    throw error
  }
}

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
  const file = await openExistingGitIgnore(ignorePath, FS.constants.O_RDONLY)

  if (file === null) {
    return null
  }

  try {
    return await file.readFile('utf8')
  } finally {
    await file.close()
  }
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
    await ensureGitIgnoreIsNotSymbolicLink(ignorePath)

    return new Promise<void>((resolve, reject) => {
      FS.unlink(ignorePath, err => (err === null ? resolve() : reject(err)))
    })
  }

  const fileContents = await formatGitIgnoreContents(text, repository)
  const file =
    (await openExistingGitIgnore(ignorePath, FS.constants.O_WRONLY)) ??
    (await open(
      ignorePath,
      FS.constants.O_CREAT |
        FS.constants.O_EXCL |
        FS.constants.O_WRONLY |
        FS.constants.O_NOFOLLOW
    ))

  try {
    await file.truncate(0)
    await file.writeFile(fileContents)
  } finally {
    await file.close()
  }
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
 * Convenience method to add the given file path(s) to the repository's gitignore.
 *
 * The file path will be escaped before adding.
 */
export async function appendIgnoreFile(
  repository: Repository,
  filePath: string | string[]
): Promise<void> {
  if (filePath instanceof Array) {
    const escapedFilePaths = filePath.map(path =>
      escapeGitSpecialCharacters(path)
    )

    return appendIgnoreRule(repository, escapedFilePaths)
  }

  const escapedFilePath = escapeGitSpecialCharacters(filePath)
  return appendIgnoreRule(repository, escapedFilePath)
}

/** Escapes a string from special characters used in a gitignore file */
export function escapeGitSpecialCharacters(pattern: string): string {
  const specialCharacters = /[\[\]!\*\#\?]/g

  return pattern.replaceAll(specialCharacters, match => {
    return '\\' + match
  })
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
      resolve(normalizedText + '\r\n')
      return
    }

    if (text === '' || text.endsWith('\n')) {
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
