/** The data-only interface for User for transport across IPC. */
export interface IUser {
  token: string
  login: string
  endpoint: string
}

/**
 * A GitHub user.
 */
export default class User implements IUser {
  private _token: string
  private _login: string
  private _endpoint: string

  /** Create a new User from some JSON. */
  public static fromJSON(obj: IUser): User {
    return new User(obj.login, obj.endpoint, obj.token)
  }

  public constructor(login: string, endpoint: string, token: string) {
    this._login = login
    this._endpoint = endpoint
    this._token = token
  }

  public get token(): string { return this._token }
  public get login(): string { return this._login }
  public get endpoint(): string { return this._endpoint }

  public userWithToken(token: string): User {
    return new User(this.login, this.endpoint, token)
  }
}
