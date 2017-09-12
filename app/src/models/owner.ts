/** The owner of a GitHubRepository. */
export class Owner {
  public readonly login: string
  public readonly endpoint: string

  public constructor(login: string, endpoint: string) {
    this.login = login
    this.endpoint = endpoint
  }

  /**
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public get hash(): string {
    return `${this.login}+${this.endpoint}`
  }
}
