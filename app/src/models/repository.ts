import * as Path from 'path'

import { GitHubRepository } from './github-repository'

/** A local repository. */
export class Repository {
  public readonly id: number
  /** The working directory of this repository */
  public readonly path: string
  public readonly name: string
  public readonly gitHubRepository: GitHubRepository | null

  /** Was the repository missing on disk last we checked? */
  public readonly missing: boolean

  public constructor(
    path: string,
    id: number,
    gitHubRepository: GitHubRepository | null,
    missing: boolean
  ) {
    this.path = path
    this.gitHubRepository = gitHubRepository
    this.name =
      (gitHubRepository && gitHubRepository.name) || Path.basename(path)
    this.id = id
    this.missing = missing
  }

  /**
   * Create a new repository the same as the receiver but with the given GitHub
   * repository.
   */
  public withGitHubRepository(gitHubRepository: GitHubRepository): Repository {
    return new Repository(this.path, this.id, gitHubRepository, this.missing)
  }

  /** Create a new repository with a changed `missing` flag. */
  public withMissing(missing: boolean): Repository {
    return new Repository(this.path, this.id, this.gitHubRepository, missing)
  }

  /** Create a new repository with a changed path. */
  public withPath(path: string): Repository {
    return new Repository(path, this.id, this.gitHubRepository, this.missing)
  }
}
