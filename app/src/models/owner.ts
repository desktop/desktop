/** The data-only interface for Owner for transport across IPC. */
export interface IOwner {
  readonly login: string
  readonly endpoint: string
}

/** The owner of a GitHubRepository. */
export class Owner implements IOwner {
  public readonly login: string
  public readonly endpoint: string

  /** Create a new Owner from a data-only representation. */
  public static fromJSON(json: IOwner): Owner {
    return new Owner(json.login, json.endpoint)
  }

  public constructor(login: string, endpoint: string) {
    this.login = login
    this.endpoint = endpoint
  }
}
