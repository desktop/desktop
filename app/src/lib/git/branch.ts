import { git, gitNetworkArguments } from './core'
import { getBranches } from './for-each-ref'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { IGitAccount } from '../../models/git-account'
import { envForAuthentication } from './authentication'
import { formatAsLocalRef } from './refs'

export interface IMergedBranch {
  /**
   * The canonical reference to the merged branch
   */
  readonly canonicalRef: string

  /**
   * The full-length Object ID (SHA) in HEX (32 chars)
   */
  readonly sha: string
}

/**
 * Create a new branch from the given start point.
 *
 * @param repository - The repository in which to create the new branch
 * @param name       - The name of the new branch
 * @param startPoint - A committish string that the new branch should be based
 *                     on, or undefined if the branch should be created based
 *                     off of the current state of HEAD
 */
export async function createBranch(
  repository: Repository,
  name: string,
  startPoint?: string
): Promise<Branch | null> {
  const args = startPoint ? ['branch', name, startPoint] : ['branch', name]

  try {
    await git(args, repository.path, 'createBranch')
    const branches = await getBranches(repository, `refs/heads/${name}`)
    if (branches.length > 0) {
      return branches[0]
    }
  } catch (err) {
    log.error('createBranch failed', err)
  }
  return null
}

/** Rename the given branch to a new name. */
export async function renameBranch(
  repository: Repository,
  branch: Branch,
  newName: string
): Promise<void> {
  await git(
    ['branch', '-m', branch.nameWithoutRemote, newName],
    repository.path,
    'renameBranch'
  )
}

/**
 * Delete the branch locally, see `deleteBranch` if you're looking to delete the
 * branch from the remote as well.
 */
export async function deleteLocalBranch(
  repository: Repository,
  branchName: string
): Promise<true> {
  await git(['branch', '-D', branchName], repository.path, 'deleteLocalBranch')
  return true
}

/**
 * Delete the branch. If the branch has a remote branch and `includeRemote` is true, it too will be
 * deleted. Silently deletes local branch if remote one is already deleted.
 */
export async function deleteBranch(
  repository: Repository,
  branch: Branch,
  account: IGitAccount | null,
  includeRemote: boolean
): Promise<true> {
  if (branch.type === BranchType.Local) {
    await deleteLocalBranch(repository, branch.name)
  }

  const remote = branch.remote

  if (!includeRemote || !remote) {
    return true
  }

  const branchExistsOnRemote = await checkIfBranchExistsOnRemote(
    repository,
    branch,
    account,
    remote
  )

  if (branchExistsOnRemote) {
    const networkArguments = await gitNetworkArguments(repository, account)

    const args = [
      ...networkArguments,
      'push',
      remote,
      `:${branch.nameWithoutRemote}`,
    ]

    const opts = { env: envForAuthentication(account) }

    // If the user is not authenticated, the push is going to fail
    // Let this propagate and leave it to the caller to handle
    await git(args, repository.path, 'deleteRemoteBranch', opts)
  }

  return true
}

async function checkIfBranchExistsOnRemote(
  repository: Repository,
  branch: Branch,
  account: IGitAccount | null,
  remote: string
): Promise<boolean> {
  const networkArguments = await gitNetworkArguments(repository, account)

  const args = [
    ...networkArguments,
    'ls-remote',
    '--heads',
    remote,
    branch.nameWithoutRemote,
  ]
  const opts = { env: envForAuthentication(account) }
  const result = await git(
    args,
    repository.path,
    'checkRemoteBranchExistence',
    opts
  )
  return result.stdout.length > 0
}

/**
 * Finds branches that have a tip equal to the given committish
 *
 * @param repository within which to execute the command
 * @param commitish a sha, HEAD, etc that the branch(es) tip should be
 * @returns list branch names. null if an error is encountered
 */
export async function getBranchesPointedAt(
  repository: Repository,
  commitish: string
): Promise<Array<string> | null> {
  const args = [
    'branch',
    `--points-at=${commitish}`,
    '--format=%(refname:short)',
  ]
  // this command has an implicit \n delimiter
  const { stdout, exitCode } = await git(
    args,
    repository.path,
    'branchPointedAt',
    {
      // - 1 is returned if a common ancestor cannot be resolved
      // - 129 is returned if ref is malformed
      //   "warning: ignoring broken ref refs/remotes/origin/master."
      successExitCodes: new Set([0, 1, 129]),
    }
  )
  if (exitCode === 1 || exitCode === 129) {
    return null
  }
  // split (and remove trailing element cause its always an empty string)
  return stdout.split('\n').slice(0, -1)
}

/**
 * Gets all branches that have been merged into the given branch
 *
 * @param repository The repository in which to search
 * @param branchName The to be used as the base branch
 */
export async function getMergedBranches(
  repository: Repository,
  branchName: string
): Promise<ReadonlyArray<IMergedBranch>> {
  const delimiter = '1F'
  const delimiterString = String.fromCharCode(parseInt(delimiter, 16))
  const canonicalBranchRef = formatAsLocalRef(branchName)

  const format = [
    '%(objectname)', // SHA
    '%(refname)',
    `%${delimiter}`, // indicate end-of-line as %(body) may contain newlines
  ].join('%00')

  const args = ['branch', `--format=${format}`, '--merged', branchName]

  const { stdout } = await git(args, repository.path, 'mergedBranches')
  const lines = stdout.split(delimiterString)

  // Remove the trailing newline
  lines.splice(-1, 1)
  const mergedBranches = new Array<IMergedBranch>()

  for (const line of lines) {
    const [sha, canonicalRef] = line.split('\0')

    if (sha === undefined || canonicalRef === undefined) {
      continue
    }

    if (canonicalRef !== canonicalBranchRef) {
      continue
    }

    mergedBranches.push({ sha, canonicalRef })
  }

  return mergedBranches
}
