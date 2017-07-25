/** The owner of a GitHubRepository. */
export class Owner {
  public readonly login: string
  public readonly endpoint: string

  public constructor(login: string, endpoint: string) {
    this.login = login
    this.endpoint = endpoint
  }
}
