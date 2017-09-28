/** The owner of a GitHubRepository. */
export class Owner {
  public readonly id: number
  public readonly login: string
  public readonly endpoint: string

  public constructor(login: string, endpoint: string, id: number) {
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
