import * as Path from 'path'

import { GitHubRepository } from './github-repository'
import { IAheadBehind } from './branch'
import { enableTutorial } from '../lib/feature-flag'

function getBaseName(path: string): string {
  const baseName = Path.basename(path)

  if (baseName.length === 0) {
    // the repository is at the root of the drive
    // -> show the full path here to show _something_
    return path
  }

  return baseName
}

/** Base type for a directory you can run git commands successfully */
export type WorkingTree = {
  readonly path: string
}

/** A local repository. */
export class Repository {
  public readonly name: string
  /**
   * The main working tree (what we commonly
   * think of as the repository's working directory)
   */
  private readonly mainWorkTree: WorkingTree

  /**
   * @param path The working directory of this repository
   * @param missing Was the repository missing on disk last we checked?
   */
  public constructor(
    path: string,
    public readonly id: number,
    public readonly gitHubRepository: GitHubRepository | null,
    public readonly missing: boolean,
    private readonly _isTutorialRepository?: boolean
  ) {
    this.mainWorkTree = { path }
    this.name = (gitHubRepository && gitHubRepository.name) || getBaseName(path)
  }

  public get path(): string {
    return this.mainWorkTree.path
  }

  /**
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public get hash(): string {
    return `${this.id}+${this.gitHubRepository && this.gitHubRepository.hash}+${
      this.path
    }+${this.missing}+${this.name}+${this.isTutorialRepository}`
  }

  /**
   * True if the repository is a tutorial repository created as part
   * of the onboarding flow. Tutorial repositories trigger a tutorial
   * user experience which introduces new users to some core concepts
   * of Git and GitHub.
   */
  public get isTutorialRepository() {
    return enableTutorial() && this._isTutorialRepository === true
  }
}

/** A worktree linked to a main working tree (aka `Repository`) */
export type LinkedWorkTree = WorkingTree & {
  /** The sha of the head commit in this work tree */
  readonly head: string
}

/**
 * A snapshot for the local state for a given repository
 */
export interface ILocalRepositoryState {
  /**
   * The ahead/behind count for the current branch, or `null` if no tracking
   * branch found.
   */
  readonly aheadBehind: IAheadBehind | null
  /**
   * The number of uncommitted changes currently in the repository.
   */
  readonly changedFilesCount: number
}

/**
 * Returns the owner/name alias if associated with a GitHub repository,
 * otherwise the folder name that contains the repository
 */
export function nameOf(repository: Repository) {
  const { gitHubRepository } = repository

  return gitHubRepository !== null ? gitHubRepository.fullName : repository.name
}
