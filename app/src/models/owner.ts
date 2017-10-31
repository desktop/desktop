/** The owner of a GitHubRepository. */
export class Owner {
  /**
   * The database ID. This may be null if the object wasn't retrieved from the
   * database.
   */
  public readonly id: number | null
  public readonly login: string
  public readonly endpoint: string

  public constructor(login: string, endpoint: string, id: number | null) {
    this.login = login
    this.endpoint = endpoint
    this.id = id
  }

  /**
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public get hash(): string {
    return `${this.login}+${this.endpoint}+${this.id}`
  }
}
