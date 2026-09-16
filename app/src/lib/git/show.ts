import { git, isMaxBufferExceededError } from './core'

import { Repository } from '../../models/repository'
import { GitError } from 'dugite'
import { coerceToBuffer } from './coerce-to-buffer'

/**
 * Resolve leading-dash revisions before appending a path so Git can report a
 * missing path instead of treating the unresolved revision:path as an option.
 */
async function resolveBlobRevision(repository: Repository, commitish: string) {
  if (!commitish.startsWith('-')) {
    return commitish
  }

  const result = await git(
    ['rev-parse', '--verify', '--end-of-options', commitish],
    repository.path,
    'resolveBlobRevision'
  )
  return result.stdout.trim()
}

/**
 * Retrieve the binary contents of a blob from the repository at a given
 * reference, commit, or tree.
 *
 * Returns a promise that will produce a Buffer instance containing
 * the binary contents of the blob or an error if the file doesn't
 * exists in the given revision.
 *
 * @param repository - The repository from where to read the blob
 *
 * @param commitish  - A commit SHA or some other identifier that
 *                     ultimately dereferences to a commit/tree.
 *
 * @param path       - The file path, relative to the repository
 *                     root from where to read the blob contents
 */
export const getBlobContents = async (
  repository: Repository,
  commitish: string,
  path: string
) => {
  const revision = await resolveBlobRevision(repository, commitish)
  return git(
    ['show', `${revision}:${path}`],
    repository.path,
    'getBlobContents',
    {
      successExitCodes: new Set([0, 1]),
      encoding: 'buffer',
    }
  ).then(r => r.stdout)
}

/**
 * Retrieve some or all binary contents of a blob from the repository
 * at a given reference, commit, or tree. This is almost identical
 * to the getBlobContents method except that it supports only reading
 * a maximum number of bytes.
 *
 * Returns a promise that will produce a Buffer instance containing
 * the binary contents of the blob or an error if the file doesn't
 * exists in the given revision.
 *
 * @param repository - The repository from where to read the blob
 *
 * @param commitish  - A commit SHA or some other identifier that
 *                     ultimately dereferences to a commit/tree.
 *
 * @param path       - The file path, relative to the repository
 *                     root from where to read the blob contents
 *
 * @param length     - The maximum number of bytes to read from
 *                     the blob. Note that the number of bytes
 *                     returned may always be less than this number.
 */
export async function getPartialBlobContents(
  repository: Repository,
  commitish: string,
  path: string,
  length: number
): Promise<Buffer | null> {
  return getPartialBlobContentsCatchPathNotInRef(
    repository,
    commitish,
    path,
    length
  )
}

export async function getPartialBlobContentsCatchPathNotInRef(
  repository: Repository,
  commitish: string,
  path: string,
  length: number
): Promise<Buffer | null> {
  const revision = await resolveBlobRevision(repository, commitish)
  const args = ['show', `${revision}:${path}`]

  return git(args, repository.path, 'getPartialBlobContentsCatchPathNotInRef', {
    maxBuffer: length,
    expectedErrors: new Set([GitError.PathExistsButNotInRef]),
    encoding: 'buffer',
  })
    .then(r =>
      r.gitError === GitError.PathExistsButNotInRef ? null : r.stdout
    )
    .catch(e =>
      isMaxBufferExceededError(e) ? coerceToBuffer(e.stdout) : Promise.reject(e)
    )
}
