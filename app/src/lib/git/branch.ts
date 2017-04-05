import { git, envForAuthentication } from './core'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { Account } from '../../models/account'

/** Create a new branch from the given start point. */
export async function createBranch(repository: Repository, name: string, startPoint: string): Promise<void> {
  await git([ 'branch', name, startPoint ], repository.path, 'createBranch')
}

/** Rename the given branch to a new name. */
export async function renameBranch(repository: Repository, branch: Branch, newName: string): Promise<void> {
  await git([ 'branch', '-m', branch.nameWithoutRemote, newName ], repository.path, 'renameBranch')
}

/**
 * Delete the branch. If the branch has a remote branch, it too will be
 * deleted.
 */
export async function deleteBranch(repository: Repository, branch: Branch, user: Account | null): Promise<true> {
  if (branch.type === BranchType.Local) {
    await git([ 'branch', '-D', branch.name ], repository.path, 'deleteBranch')
  }

  const remote = branch.remote

  // If the user is not authenticated, the push is going to fail
  // Let this propagate and leave it to the caller to handle
  if (remote) {
    await git([ 'push', remote, `:${branch.nameWithoutRemote}` ], repository.path, 'deleteBranch', { env: envForAuthentication(user) })
  }

  return true
}
