import { Owner } from './owner'

/** A GitHub repository. */
export class GitHubRepository {
  /**
   * The ID of the repository in the app's local database. This is no relation
   * to the API ID.
   *
   * May be `null` if it hasn't been inserted or retrieved from the database.
   */
  public readonly dbID: number | null

  public readonly name: string
  public readonly owner: Owner
  public readonly private: boolean | null
  public readonly htmlURL: string | null
  public readonly defaultBranch: string | null
  public readonly cloneURL: string | null
  public readonly parent: GitHubRepository | null

  public constructor(
    name: string,
    owner: Owner,
    dbID: number | null,
    private_: boolean | null = null,
    htmlURL: string | null = null,
    defaultBranch: string | null = 'master',
    cloneURL: string | null = null,
    parent: GitHubRepository | null = null
  ) {
    this.name = name
    this.owner = owner
    this.dbID = dbID
    this.private = private_
    this.htmlURL = htmlURL
    this.defaultBranch = defaultBranch
    this.cloneURL = cloneURL
    this.parent = parent
  }

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
    return `${this.dbID}+${this.defaultBranch}+${this.private}+${
      this.cloneURL
    }+${this.name}+${this.htmlURL}+${this.owner.hash}+${this.parent &&
      this.parent.hash}`
  }
}
