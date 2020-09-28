import { ChildProcess } from 'child_process'

import { git } from './core'
import { spawnAndComplete } from './spawn'

import { Repository } from '../../models/repository'

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
export async function getBlobContents(
  repository: Repository,
  commitish: string,
  path: string
): Promise<Buffer> {
  const successExitCodes = new Set([0, 1])
  const setBinaryEncoding: (process: ChildProcess) => void = cb => {
    // If Node.js encounters a synchronous runtime error while spawning
    // `stdout` will be undefined and the error will be emitted asynchronously
    if (cb.stdout) {
      cb.stdout.setEncoding('binary')
    }
  }

  const args = ['show', `${commitish}:${path}`]
  const opts = {
    successExitCodes,
    processCallback: setBinaryEncoding,
  }

  const blobContents = await git(args, repository.path, 'getBlobContents', opts)

  return Buffer.from(blobContents.stdout, 'binary')
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
): Promise<Buffer> {
  const successExitCodes = new Set([0, 1])

  const args = ['show', `${commitish}:${path}`]

  const { output } = await spawnAndComplete(
    args,
    repository.path,
    'getPartialBlobContents',
    successExitCodes,
    length
  )

  return output
}
