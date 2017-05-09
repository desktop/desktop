import * as Path from 'path'
import * as Fs from 'fs'

import { git } from './core'
import { Repository } from '../../models/repository'

/** Merge the named branch into the current branch. */
export async function merge(repository: Repository, branch: string): Promise<void> {
  await git([ 'merge', branch ], repository.path, 'merge')
}

/**
 * Check that the repository is in the middle of a merge, using the presence of
 * the MERGE_HEAD file to validate this.
 */
export async function mergeExists(repository: Repository): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const mergeHead = Path.join(repository.path, '.git', 'MERGE_HEAD')
    Fs.exists(mergeHead, (exists) => {
      resolve(exists)
    })
  })
}
