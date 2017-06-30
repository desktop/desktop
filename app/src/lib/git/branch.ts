import { git, envForAuthentication, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { Account } from '../../models/account'

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
): Promise<true> {
  const args = startPoint ? ['branch', name, startPoint] : ['branch', name]

  await git(args, repository.path, 'createBranch')
  return true
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
 * Delete the branch. If the branch has a remote branch, it too will be
 * deleted. Silently deletes local branch if remote one is already deleted.
 */
export async function deleteBranch(
  repository: Repository,
  branch: Branch,
  account: Account | null
): Promise<true> {
  if (branch.type === BranchType.Local) {
    await git(['branch', '-D', branch.name], repository.path, 'deleteBranch')
  }

  const remote = branch.remote

  // If the user is not authenticated, the push is going to fail
  // Let this propagate and leave it to the caller to handle
  if (!remote) {
    return true
  }

  const branchExistsOnRemote = await checkIfBranchExistsOnRemote(
    repository,
    branch,
    account,
    remote
  )

  // Delete local branch only if remote one is already deleted
  if (branchExistsOnRemote) {
    const args = [
      ...gitNetworkArguments,
      'push',
      remote,
      `:${branch.nameWithoutRemote}`,
    ]

    const opts = { env: envForAuthentication(account) }
    await git(args, repository.path, 'deleteBranch', opts)
  }

  return true
}

async function checkIfBranchExistsOnRemote(
  repository: Repository,
  branch: Branch,
  account: Account | null,
  remote: string
): Promise<boolean> {
  const args = [
    ...gitNetworkArguments,
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
