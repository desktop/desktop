import { Owner } from './owner'

export type GitHubRepositoryPermission = 'read' | 'write' | 'admin' | null

/** A GitHub repository. */
export class GitHubRepository {
  public constructor(
    public readonly name: string,
    public readonly owner: Owner,
    /**
     * The ID of the repository in the app's local database. This is no relation
     * to the API ID.
     *
     * May be `null` if it hasn't been inserted or retrieved from the database.
     */
    public readonly dbID: number | null,
    public readonly isPrivate: boolean | null = null,
    public readonly htmlURL: string | null = null,
    public readonly defaultBranch: string | null = 'master',
    public readonly cloneURL: string | null = null,
    public readonly issuesEnabled: boolean | null = null,
    public readonly isArchived: boolean | null = null,
    /** The user's permissions for this github repository. `null` if unknown. */
    public readonly permissions: GitHubRepositoryPermission = null,
    public readonly parent: GitHubRepository | null = null
  ) {}

  public get endpoint(): string {
    return this.owner.endpoint
  }

  /** Get the owner/name combo. */
  public get fullName(): string {
    return `${this.owner.login}/${this.name}`
  }

  /** Is the repository a fork? */
  public get fork(): boolean {
    return !!this.parent
  }

  /**
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public get hash(): string {
    return `${this.dbID}+${this.defaultBranch}+${this.isPrivate}+${
      this.cloneURL
    }+${this.name}+${this.htmlURL}+${this.owner.hash}+${this.parent &&
      this.parent.hash}`
  }
}

/**
 * Identical to `GitHubRepository`, except it **must** have a `parent`
 * (i.e it's a fork).
 *
 * See `isRepositoryWithForkedGitHubRepository`
 */
export type ForkedGitHubRepository = GitHubRepository & {
  readonly parent: GitHubRepository
  readonly fork: true
}

/**
 * Can the user push to this GitHub repository?
 *
 * (If their permissions are unknown, we assume they can.)
 */
export function hasWritePermission(
  gitHubRepository: GitHubRepository
): boolean {
  return (
    gitHubRepository.permissions === null ||
    gitHubRepository.permissions !== 'read'
  )
}
