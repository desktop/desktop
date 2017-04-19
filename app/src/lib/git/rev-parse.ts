import * as Path from 'path'

import { git } from './core'
import { Repository } from '../../models/repository'

/** Get the git dir of the path. */
export async function getGitDir(path: string): Promise<string | null> {
  const result = await git([ 'rev-parse', '--git-dir' ], path, 'getGitDir', { successExitCodes: new Set([ 0, 128 ]) })
  // Exit code 128 means it was run in a directory that's not a git
  // repository.
  if (result.exitCode === 128) {
    return null
  }

  const gitDir = result.stdout
  const trimmedDir = gitDir.trim()
  return Path.join(path, trimmedDir)
}

/**
 * Attempts to dereference the HEAD symbolic link to a commit sha.
 * Returns null if HEAD is unborn.
 */
export async function resolveHEAD(repository: Repository): Promise<string | null> {
  const result = await git([ 'rev-parse', '--verify', 'HEAD^{commit}' ], repository.path, 'resolveHEAD', { successExitCodes: new Set([ 0, 128 ]) })
  if (result.exitCode === 0) {
    return result.stdout
  } else {
    return null
  }
}

/** Is the path a git repository? */
export async function isGitRepository(path: string): Promise<boolean> {
  const result = await getGitDir(path)
  return !!result
}
