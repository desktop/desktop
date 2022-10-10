import { getDefaultBranch } from '../helpers/default-branch'
import { git } from './core'

/** Init a new git repository in the given path. */
export async function initGitRepository(path: string): Promise<void> {
  await git(
    ['-c', `init.defaultBranch=${await getDefaultBranch()}`, 'init'],
    path,
    'initGitRepository'
  )
}
