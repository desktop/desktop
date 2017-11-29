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
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public get hash(): string {
    return `${this.id}+
      ${this.gitHubRepository && this.gitHubRepository.hash}+
      ${this.path}+
      ${this.missing}+
      ${this.name}`
  }
}
