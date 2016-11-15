import { git } from './git/core'

import { Repository } from '../models/repository'

/* tslint:disable:no-stateless-class */

/**
 * Interactions with a local Git repository
 */
export class LocalGitOperations {

  /** Check out the given branch. */
  public static checkoutBranch(repository: Repository, name: string): Promise<void> {
    return git([ 'checkout', name, '--' ], repository.path)
  }


  /** Check out the paths at HEAD. */
  public static checkoutPaths(repository: Repository, paths: ReadonlyArray<string>): Promise<void> {
    return git([ 'checkout', '--', ...paths ], repository.path)
  }
}
