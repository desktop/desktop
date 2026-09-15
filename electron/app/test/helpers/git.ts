import { getCommit, getBranches } from '../../src/lib/git'
import { Commit } from '../../src/models/commit'
import { Repository } from '../../src/models/repository'
import { Branch } from '../../src/models/branch'

/**
 * Get the tip commit of the current repository
 *
 * Throws an error if the repository is unborn, to indicate an invalid state.
 */
export async function getTipOrError(repository: Repository): Promise<Commit> {
  const commit = await getCommit(repository, 'HEAD')

  if (commit === null) {
    throw new Error(
      'Unable to find commit for HEAD - check that you are not working with an unborn repository'
    )
  }

  return commit
}

/**
 * Get the commit associated with a provided ref (could also be a commit ID or a branch name).
 *
 * Throws an error if the commit cannot be found in the repository.
 */
export async function getRefOrError(
  repository: Repository,
  ref: string
): Promise<Commit> {
  const commit = await getCommit(repository, ref)

  if (commit === null) {
    throw new Error(
      `Unable to find commit for ${ref} - check that this exists in the repository`
    )
  }

  return commit
}

/**
 * Get the branch object associated with a local branch name.
 *
 * Throws an error if it cannot find the expected `refs/heads/{name}` ref in the
 * repository.
 */
export async function getBranchOrError(
  repository: Repository,
  name: string
): Promise<Branch> {
  const ref = `refs/heads/${name}`
  const branches = await getBranches(repository, ref)

  if (branches.length === 0) {
    throw new Error(
      `Unable to find branch matching ${ref} - check that this exists in the repository`
    )
  }

  return branches[0]
}
