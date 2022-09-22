import * as Path from 'path'

import { GitHubRepository, ForkedGitHubRepository } from './github-repository'
import { IAheadBehind } from './branch'
import {
  WorkflowPreferences,
  ForkContributionTarget,
} from './workflow-preferences'
import { assertNever, fatalError } from '../lib/fatal-error'
import { createEqualityHash } from './equality-hash'

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
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public hash: string

  /**
   * @param path The working directory of this repository
   * @param missing Was the repository missing on disk last we checked?
   */
  public constructor(
    path: string,
    public readonly id: number,
    public readonly gitHubRepository: GitHubRepository | null,
    public readonly missing: boolean,
    public readonly alias: string | null = null,
    public readonly workflowPreferences: WorkflowPreferences = {},
    /**
     * True if the repository is a tutorial repository created as part of the
     * onboarding flow. Tutorial repositories trigger a tutorial user experience
     * which introduces new users to some core concepts of Git and GitHub.
     */
    public readonly isTutorialRepository: boolean = false
  ) {
    this.mainWorkTree = { path }
    this.name = (gitHubRepository && gitHubRepository.name) || getBaseName(path)

    this.hash = createEqualityHash(
      path,
      this.id,
      gitHubRepository?.hash,
      this.missing,
      this.alias,
      this.workflowPreferences.forkContributionTarget,
      this.isTutorialRepository
    )
  }

  public get path(): string {
    return this.mainWorkTree.path
  }
}

/** A worktree linked to a main working tree (aka `Repository`) */
export type LinkedWorkTree = WorkingTree & {
  /** The sha of the head commit in this work tree */
  readonly head: string
}

/** Identical to `Repository`, except it **must** have a `gitHubRepository` */
export type RepositoryWithGitHubRepository = Repository & {
  readonly gitHubRepository: GitHubRepository
}

/**
 * Identical to `Repository`, except it **must** have a `gitHubRepository`
 * which in turn must have a parent. In other words this is a GitHub (.com
 * or Enterprise) fork.
 */
export type RepositoryWithForkedGitHubRepository = Repository & {
  readonly gitHubRepository: ForkedGitHubRepository
}

/**
 * Returns whether the passed repository is a GitHub repository.
 *
 * This function narrows down the type of the passed repository to
 * RepositoryWithGitHubRepository if it returns true.
 */
export function isRepositoryWithGitHubRepository(
  repository: Repository
): repository is RepositoryWithGitHubRepository {
  return repository.gitHubRepository instanceof GitHubRepository
}

/**
 * Asserts that the passed repository is a GitHub repository.
 */
export function assertIsRepositoryWithGitHubRepository(
  repository: Repository
): asserts repository is RepositoryWithGitHubRepository {
  if (!isRepositoryWithGitHubRepository(repository)) {
    return fatalError(`Repository must be GitHub repository`)
  }
}

/**
 * Returns whether the passed repository is a GitHub fork.
 *
 * This function narrows down the type of the passed repository to
 * RepositoryWithForkedGitHubRepository if it returns true.
 */
export function isRepositoryWithForkedGitHubRepository(
  repository: Repository
): repository is RepositoryWithForkedGitHubRepository {
  return (
    isRepositoryWithGitHubRepository(repository) &&
    repository.gitHubRepository.parent !== null
  )
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

/**
 * Get the GitHub html URL for a repository, if it has one.
 * Will return the parent GitHub repository's URL if it has one.
 * Otherwise, returns null.
 */
export function getGitHubHtmlUrl(repository: Repository): string | null {
  if (!isRepositoryWithGitHubRepository(repository)) {
    return null
  }

  return getNonForkGitHubRepository(repository).htmlURL
}

/**
 * Attempts to honor the Repository's workflow preference for GitHubRepository contributions.
 * Falls back to returning the GitHubRepository when a non-fork repository
 * is passed, returns the parent GitHubRepository otherwise.
 */
export function getNonForkGitHubRepository(
  repository: RepositoryWithGitHubRepository
): GitHubRepository {
  if (!isRepositoryWithForkedGitHubRepository(repository)) {
    // If the repository is not a fork, we don't have to worry about anything.
    return repository.gitHubRepository
  }

  const forkContributionTarget = getForkContributionTarget(repository)

  switch (forkContributionTarget) {
    case ForkContributionTarget.Self:
      return repository.gitHubRepository
    case ForkContributionTarget.Parent:
      return repository.gitHubRepository.parent
    default:
      return assertNever(
        forkContributionTarget,
        'Invalid fork contribution target'
      )
  }
}

/**
 * Returns a non-undefined forkContributionTarget for the specified repository.
 */
export function getForkContributionTarget(
  repository: Repository
): ForkContributionTarget {
  return repository.workflowPreferences.forkContributionTarget !== undefined
    ? repository.workflowPreferences.forkContributionTarget
    : ForkContributionTarget.Parent
}
