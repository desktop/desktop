import { git, envForAuthentication } from './core'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { Tip, TipState } from '../../models/tip'
import { User } from '../../models/user'
import { getCurrentBranch } from './for-each-ref'

import { fatalError } from '../../lib/fatal-error'

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
export async function deleteBranch(repository: Repository, branch: Branch, user: User | null): Promise<true> {
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

/** Get the name of the current branch. */
export async function getTip(repository: Repository): Promise<Tip> {

  const revParse = await git([ 'rev-parse', 'HEAD' ], repository.path, 'getTip', { successExitCodes: new Set([ 0, 128 ]) })
  if (revParse.exitCode === 128) {
    // fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.
    return {
      kind: TipState.Unborn,
    }
  }

  const currentSha = revParse.stdout.trim()

  const symbolicRef = await git([ 'symbolic-ref', 'HEAD' ], repository.path, 'getTip', { successExitCodes: new Set([ 0, 128 ]) })
  if (symbolicRef.exitCode === 128) {
    // fatal: ref HEAD is not a symbolic ref
    return {
      kind: TipState.Detached,
      currentSha,
    }
  }

  const currentBranch = await getCurrentBranch(repository)
  if (!currentBranch) {
    fatalError(`getTip failed despite all the previous guard checks`)
    return { kind: TipState.Unknown }
  }

  return {
    kind: TipState.Valid,
    branch: currentBranch,
  }
}
