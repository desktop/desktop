/** The data-only interface for Owner for transport across IPC. */
export interface IOwner {
  login: string
  endpoint: string
}

export default class Owner {
  private login: string
  private endpoint: string

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
