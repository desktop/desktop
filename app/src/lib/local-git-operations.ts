import { git } from './git/core'

import { WorkingDirectoryFileChange } from '../models/status'
import { Repository } from '../models/repository'

import { isHeadUnborn } from './git/repository'
import { stageFiles } from './git/add'

/* tslint:disable:no-stateless-class */

/**
 * Interactions with a local Git repository
 */
export class LocalGitOperations {

  public static async createCommit(repository: Repository, message: string, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<void> {
    // Clear the staging area, our diffs reflect the difference between the
    // working directory and the last commit (if any) so our commits should
    // do the same thing.
    if (await isHeadUnborn(repository)) {
      await git([ 'reset' ], repository.path)
    } else {
      await git([ 'reset', 'HEAD', '--mixed' ], repository.path)
    }

    await stageFiles(repository, files)

    await git([ 'commit', '-F',  '-' ] , repository.path, { stdin: message })
  }

  /** Check out the given branch. */
  public static checkoutBranch(repository: Repository, name: string): Promise<void> {
    return git([ 'checkout', name, '--' ], repository.path)
  }


  /** Check out the paths at HEAD. */
  public static checkoutPaths(repository: Repository, paths: ReadonlyArray<string>): Promise<void> {
    return git([ 'checkout', '--', ...paths ], repository.path)
  }
}
