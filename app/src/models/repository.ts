import * as Path from 'path'

import { GitHubRepository } from './github-repository'
import { IAheadBehind } from './branch'
import { WorkingDirectoryFileChange } from './status'

/** A local repository. */
export class Repository {
  public readonly id: number
  /** The working directory of this repository */
  public readonly path: string
  public readonly name: string
  public readonly gitHubRepository: GitHubRepository | null

  /** Was the repository missing on disk last we checked? */
  public readonly missing: boolean

  public aheadBehind: IAheadBehind | null
  public changedFiles: ReadonlyArray<WorkingDirectoryFileChange> | null

  public constructor(
    path: string,
    id: number,
    gitHubRepository: GitHubRepository | null,
    missing: boolean,
    aheadBehind?: IAheadBehind,
    changedFiles?: ReadonlyArray<WorkingDirectoryFileChange>
  ) {
    this.path = path
    this.gitHubRepository = gitHubRepository
    this.name =
      (gitHubRepository && gitHubRepository.name) || Path.basename(path)
    this.id = id
    this.missing = missing
    this.aheadBehind = aheadBehind || null
    this.changedFiles = changedFiles || null
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

  public setChangedFiles(
    changedFiles: ReadonlyArray<WorkingDirectoryFileChange>
  ) {
    this.changedFiles = changedFiles
  }

  public setAheadBehind(aheadBehind: IAheadBehind | null) {
    this.aheadBehind = aheadBehind
  }
}
