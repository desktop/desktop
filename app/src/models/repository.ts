import * as path from 'path'

import { GitHubRepository, IGitHubRepository } from './github-repository'

/** The data-only interface for Repository for transport across IPC. */
export interface IRepository {
  readonly id: number
  /** The working directory of this repository */
  readonly path: string
  readonly gitHubRepository: IGitHubRepository | null

  /** Was the repository missing on disk last we checked? */
  readonly missing: boolean
}

/** A local repository. */
export class Repository implements IRepository {
  public readonly id: number
  /** The working directory of this repository */
  public readonly path: string
  public readonly gitHubRepository: GitHubRepository | null

  /** Was the repository missing on disk last we checked? */
  public readonly missing: boolean

  /** Create a new Repository from a data-only representation. */
  public static fromJSON(json: IRepository): Repository {
    const gitHubRepository = json.gitHubRepository
    if (gitHubRepository) {
       return new Repository(json.path, json.id, GitHubRepository.fromJSON(gitHubRepository), json.missing)
    } else {
      return new Repository(json.path, json.id, null, json.missing)
    }
  }

  public constructor(path: string, id: number, gitHubRepository: GitHubRepository | null, missing: boolean) {
    this.path = path
    this.gitHubRepository = gitHubRepository
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

  public get name(): string {
    return path.basename(this.path)
  }
}
