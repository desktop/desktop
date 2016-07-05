/** The data-only interface for Owner for transport across IPC. */
export interface IOwner {
  login: string
  endpoint: string
}

/** The owner of a GitHubRepository. */
export default class Owner implements IOwner {
  private _login: string
  private _endpoint: string

  /** Create a new Owner from a data-only representation. */
  public static fromJSON(json: IOwner): Owner {
    return new Owner(json.login, json.endpoint)
  }

  public constructor(login: string, endpoint: string) {
    this._login = login
    this._endpoint = endpoint
  }

  public get login(): string { return this._login }
  public get endpoint(): string { return this._endpoint }
}
