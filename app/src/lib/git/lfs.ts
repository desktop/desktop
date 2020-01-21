import { git, gitNetworkArguments, GitError } from './core'
import { Repository } from '../../models/repository'
import { IGitAccount } from '../../models/git-account'
import { envForAuthentication } from './authentication'

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
    ['check-attr', 'filter', path],
    repository.path,
    'checkAttrForLFS'
  )

  // "git check-attr -a" will output every filter it can find in .gitattributes
  // and it looks like this:
  //
  // README.md: diff: lfs
  // README.md: merge: lfs
  // README.md: text: unset
  // README.md: filter: lfs
  //
  // To verify git-lfs this test will just focus on that last row, "filter",
  // and the value associated with it. If nothing is found in .gitattributes
  // the output will look like this
  //
  // README.md: filter: unspecified

  const lfsFilterRegex = /: filter: lfs/

  const match = lfsFilterRegex.exec(stdout)

  return match !== null
}

/**
 * Query a Git repository and filter the set of provided relative paths to see
 * which are not covered by the current Git LFS configuration.
 *
 * @param repository
 * @param filePaths List of relative paths in the repository
 */
export async function filesNotTrackedByLFS(
  repository: Repository,
  filePaths: ReadonlyArray<string>
): Promise<ReadonlyArray<string>> {
  const filesNotTrackedByGitLFS = new Array<string>()

  for (const file of filePaths) {
    const isTracked = await isTrackedByLFS(repository, file)

    if (!isTracked) {
      filesNotTrackedByGitLFS.push(file)
    }
  }

  return filesNotTrackedByGitLFS
}

/**
 * Query a Git repository for file locks
 *
 * @param repository - The repository from which to push
 *
 * @param account - The account to use when authenticating with the remote
 */
export async function getFileLocks(
  repository: Repository,
  account: IGitAccount | null
): Promise<ReadonlyMap<string, string>> {
  const tempLocks = new Map<string, string>()

  // Run Git command
  const args = ['lfs', 'locks', '--json']

  // THIS IS A MEMORY LEAK IF THE USER IS NOT LOGGED IN BECAUSE ENVIRONMENT VARIABLES ARE NOT PASSED IN TO LFS
  const result = await git(args, repository.path, 'getFileLocks', {
    env: envForAuthentication(account),
  })
  if (result.gitErrorDescription) {
    throw new GitError(result, args)
  } else if (result.stdout === '[]\n') {
    // empty json
    return tempLocks
  }

  // Parse
  const tempParsed = JSON.parse(result.stdout)
  const tempLength = tempParsed.length
  for (let i = 0; i < tempLength; ++i) {
    tempLocks.set(tempParsed[i].path, tempParsed[i].owner.name)
  }

  return tempLocks
}

/**
 * Toggles file locks
 *
 * @param repository - The repository from which to push
 *
 * @param account - The account to use when authenticating with the remote
 *
 * @param paths - File paths to lock/unlock
 *
 * @param isLocked - True if locked, false if unlocked
 */
export async function toggleFileLocks(
  repository: Repository,
  account: IGitAccount | null,
  paths: ReadonlyArray<string>,
  isLocked: boolean
): Promise<void> {
  if (paths.length > 0) {
    const tempEnvironment = { env: envForAuthentication(account) }
    const networkArguments = await gitNetworkArguments(repository, account)
    const args = [...networkArguments, 'lfs', isLocked ? 'lock' : 'unlock']

    // From a usability/UI perspective, it makes no sense not to force unlocks... this also resolves weird repo errors
    if (!isLocked) {
      args.push('--force')
    }

    for (let i = paths.length - 1; i >= 0; --i) {
      await git(
        [...args, paths[i]],
        repository.path,
        'toggleFileLocks',
        tempEnvironment
      )
    }
  }
}
