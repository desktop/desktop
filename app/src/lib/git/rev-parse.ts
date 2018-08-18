import * as Path from 'path'

import { git } from './core'
import { RepositoryDoesNotExistErrorCode } from 'dugite'

/**
 * Get the absolute path to the top level working directory.
 *
 * @param path The path to a presumptive Git repository, either the root
 *             of the repository or any path within that repository.
 *
 * @returns null if the path provided doesn't reside within a Git repository.
 */
export async function getTopLevelWorkingDirectory(
  path: string
): Promise<string | null> {
  let result

  try {
    // Note, we use --show-cdup here instead of --show-toplevel because show-toplevel
    // dereferences symlinks and we want to resolve a path as closely as possible to
    // what the user gave us.
    result = await git(
      ['rev-parse', '--show-cdup'],
      path,
      'getTopLevelWorkingDirectory',
      {
        successExitCodes: new Set([0, 128]),
      }
    )
  } catch (err) {
    if (err.code === RepositoryDoesNotExistErrorCode) {
      return null
    }

    throw err
  }

  // Exit code 128 means it was run in a directory that's not a git
  // repository.
  if (result.exitCode === 128) {
    return null
  }

  const relativePath = result.stdout.trim()

  // No output means we're already at the root
  if (!relativePath) {
    return path
  }

  return Path.resolve(path, relativePath)
}

export async function checkIfRepositoryIsBare(
  path: string
): Promise<boolean | null> {
  let result

  try {
    result = await git(
      ['rev-parse', '--is-bare-repository'],
      path,
      'checkIfRepositoryIsBare'
    )
  } catch (e) {
    if (e.message.includes('not a git repository')) {
      return null
    }

    throw e
  }

  if (result === null) {
    return null
  } else {
    return result.stdout === 'true\n'
  }
}

/** Is the path a git repository? */
export async function isGitRepository(path: string): Promise<boolean> {
  return (await getTopLevelWorkingDirectory(path)) !== null
}
