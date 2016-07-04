/** The data-only interface for Owner for transport across IPC. */
export interface IOwner {
  login: string
  endpoint: string
}

/** The owner of a GitHubRepository. */
export default class Owner {
  private login: string
  private endpoint: string

  /** Create a new Owner from a data-only representation. */
  public static fromJSON(json: IOwner): Owner {
    return new Owner(json.login, json.endpoint)
  }

  public constructor(login: string, endpoint: string) {
    this.login = login
    this.endpoint = endpoint
  }

  public getLogin(): string {
    return this.login
  }

  public getEndpoint(): string {
    return this.endpoint
  }
}
