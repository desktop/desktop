import { git, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { formatAsLocalRef } from './refs'
import { deleteRef } from './update-ref'
import { GitError as DugiteError } from 'dugite'
import { envForRemoteOperation } from './environment'
import { createForEachRefParser } from './git-delimiter-parser'
import { IRemote } from '../../models/remote'

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
  startPoint: string | null,
  noTrack?: boolean
): Promise<void> {
  const args =
    startPoint !== null ? ['branch', name, startPoint] : ['branch', name]

  // if we're branching directly from a remote branch, we don't want to track it
  // tracking it will make the rest of desktop think we want to push to that
  // remote branch's upstream (which would likely be the upstream of the fork)
  if (noTrack) {
    args.push('--no-track')
  }

  await git(args, repository.path, 'createBranch')
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
 * Delete the branch locally.
 */
export async function deleteLocalBranch(
  repository: Repository,
  branchName: string
): Promise<true> {
  await git(['branch', '-D', branchName], repository.path, 'deleteLocalBranch')
  return true
}

/**
 * Deletes a remote branch
 *
 * @param remoteName - the name of the remote to delete the branch from
 * @param remoteBranchName - the name of the branch on the remote
 */
export async function deleteRemoteBranch(
  repository: Repository,
  remote: IRemote,
  remoteBranchName: string
): Promise<true> {
  const args = [
    ...gitNetworkArguments(),
    'push',
    remote.name,
    `:${remoteBranchName}`,
  ]

  // If the user is not authenticated, the push is going to fail
  // Let this propagate and leave it to the caller to handle
  const result = await git(args, repository.path, 'deleteRemoteBranch', {
    env: await envForRemoteOperation(remote.url),
    expectedErrors: new Set<DugiteError>([DugiteError.BranchDeletionFailed]),
  })

  // It's possible that the delete failed because the ref has already
  // been deleted on the remote. If we identify that specific
  // error we can safely remove our remote ref which is what would
  // happen if the push didn't fail.
  if (result.gitError === DugiteError.BranchDeletionFailed) {
    const ref = `refs/remotes/${remote.name}/${remoteBranchName}`
    await deleteRef(repository, ref)
  }

  return true
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
      //   "warning: ignoring broken ref refs/remotes/origin/main."
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
 * @returns map of branch canonical refs paired to its sha
 */
export async function getMergedBranches(
  repository: Repository,
  branchName: string
): Promise<Map<string, string>> {
  const canonicalBranchRef = formatAsLocalRef(branchName)
  const { formatArgs, parse } = createForEachRefParser({
    sha: '%(objectname)',
    canonicalRef: '%(refname)',
  })

  const args = ['branch', ...formatArgs, '--merged', branchName]
  const mergedBranches = new Map<string, string>()
  const { stdout } = await git(args, repository.path, 'mergedBranches')

  for (const branch of parse(stdout)) {
    // Don't include the branch we're using to compare against
    // in the list of branches merged into that branch.
    if (branch.canonicalRef !== canonicalBranchRef) {
      mergedBranches.set(branch.canonicalRef, branch.sha)
    }
  }

  return mergedBranches
}
