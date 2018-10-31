import { git } from './core'
import { Repository } from '../../models/repository'
import { caseInsensitiveCompare } from '../compare'

/** Install the global LFS filters. */
export async function installGlobalLFSFilters(force: boolean): Promise<void> {
  const args = ['lfs', 'install', '--skip-repo']
  if (force) {
    args.push('--force')
  }

  await git(args, __dirname, 'installGlobalLFSFilter')
}

/** Install LFS hooks in the repository. */
export async function installLFSHooks(
  repository: Repository,
  force: boolean
): Promise<void> {
  const args = ['lfs', 'install']
  if (force) {
    args.push('--force')
  }

  await git(args, repository.path, 'installLFSHooks')
}

/** Is the repository configured to track any paths with LFS? */
export async function isUsingLFS(repository: Repository): Promise<boolean> {
  const env = {
    GIT_LFS_TRACK_NO_INSTALL_HOOKS: '1',
  }
  const result = await git(['lfs', 'track'], repository.path, 'isUsingLFS', {
    env,
  })
  return result.stdout.length > 0
}

/**
 * Check if a provided file path is being tracked by Git LFS
 *
 * This uses the Git plumbing to read the .gitattributes file
 * for any LFS-related rules that are set for the file
 *
 * @param repository repository with
 * @param path relative file path in the repository
 */
export async function isTrackedByLFS(
  repository: Repository,
  path: string
): Promise<boolean> {
  const { stdout } = await git(
    ['check-attr', '-a', path],
    repository.path,
    'checkAttrForLFS'
  )

  const lfsFilterRegex = /(.*): filter: lfs/

  const match = lfsFilterRegex.exec(stdout)

  if (match == null || match.length !== 2) {
    return false
  }

  const fileName = match[1]
  if (caseInsensitiveCompare(fileName, path) !== 0) {
    return false
  }

  return true
}
