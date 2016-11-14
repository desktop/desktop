import { git } from './core'
import { Repository } from '../../models/repository'
import { getGitDir, resolveHEAD } from './rev-parse'

/** Is the path a git repository? */
export async function isGitRepository(path: string): Promise<boolean> {
  const result = await getGitDir(path)
  return !!result
}

/**
 * Attempts to dereference the HEAD symbolic reference to a commit in order
 * to determine if HEAD is unborn or not.
 */
export async function isHeadUnborn(repository: Repository): Promise<boolean> {
  return await resolveHEAD(repository) === null
}

/** Init a new git repository in the given path. */
export async function initGitRepository(path: string): Promise<void> {
  await git([ 'init' ], path)
}
