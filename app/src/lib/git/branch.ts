import { git } from './core'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'

/** Create a new branch from the given start point. */
export async function createBranch(repository: Repository, name: string, startPoint: string): Promise<void> {
  await git([ 'branch', name, startPoint ], repository.path)
}

/** Rename the given branch to a new name. */
export async function renameBranch(repository: Repository, branch: Branch, newName: string): Promise<void> {
  await git([ 'branch', '-m', branch.nameWithoutRemote, newName ], repository.path)
}

/**
 * Delete the branch. If the branch has a remote branch, it too will be
 * deleted.
 */
export async function deleteBranch(repository: Repository, branch: Branch): Promise<true> {
  if (branch.type === BranchType.Local) {
    await git([ 'branch', '-D', branch.name ], repository.path)
  }

  // @TODO: Surely this needs a user and some envForAuthentication love?
  const remote = branch.remote
  if (remote) {
    await git([ 'push', remote, `:${branch.nameWithoutRemote}` ], repository.path)
  }

  return true
}
