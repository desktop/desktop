import * as Path from 'path'

import { GitHubRepository } from './github-repository'
import { IAheadBehind } from './branch'

export interface IRepositoryStatus {
  /** Whether the repository has uncommitted changes on disk */
  readonly hasChanges: boolean
  /** The ahead/behind count for the current branch (assumes tracking branch) */
  readonly aheadBehind: IAheadBehind | null
}

/** A local repository. */
export class Repository {
  public readonly id: number
  /** The working directory of this repository */
  public readonly path: string
  /** The friendly name for the repository, if a GitHub remote exists, or the directory name of the repository */
  public readonly name: string
  /** The GitHub API repository details for the current repository, or `null` if the repository has another remote */
  public readonly gitHubRepository: GitHubRepository | null
  /** Was the repository missing on disk last we checked? */
  public readonly missing: boolean
  /** The last known state of the ahead/behind count for the current branch (assumes tracking branch) */
  public readonly aheadBehind: IAheadBehind | null
  /** The last known state for whether there are uncommitted changes for the repository */
  public readonly hasChanges: boolean

  public constructor(
    path: string,
    id: number,
    gitHubRepository: GitHubRepository | null,
    missing: boolean,
    hasChanges: boolean = false,
    aheadBehind: IAheadBehind | null = null
  ) {
    this.path = path
    this.gitHubRepository = gitHubRepository
    this.name =
      (gitHubRepository && gitHubRepository.name) || Path.basename(path)
    this.id = id
    this.missing = missing
    this.hasChanges = hasChanges
    this.aheadBehind = aheadBehind || null
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

  public withLocalStatus(status: IRepositoryStatus): Repository {
    return new Repository(
      this.path,
      this.id,
      this.gitHubRepository,
      this.missing,
      status.hasChanges,
      status.aheadBehind
    )
  }
}
