/** The owner of a GitHubRepository. */
export class Owner {
  /**
   * @param id The database ID. This may be null if the object wasn't retrieved from the database.
   */
  public constructor(
    public readonly login: string,
    public readonly endpoint: string,
    public readonly id: number | null
  ) {}

  /**
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public get hash(): string {
    return `${this.login}+${this.endpoint}+${this.id}`
  }
}
