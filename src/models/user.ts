/** The data-only interface for User for transport across IPC. */
export interface IUser {
  token: string
  login: string
  endpoint: string
}

/**
 * A GitHub user.
 */
export default class User {
  // TODO: These will be readonly once readonly is a thing.
  private token: string
  private login: string
  private endpoint: string

  /** Create a new User from some JSON. */
  public static fromJSON(obj: IUser): User {
    return new User(obj.login, obj.endpoint, obj.token)
  }

  public constructor(login: string, endpoint: string, token: string) {
    this.login = login
    this.endpoint = endpoint
    this.token = token
  }

  public getToken(): string {
    return this.token
  }

  public getLogin(): string {
    return this.login
  }

  public getEndpoint(): string {
    return this.endpoint
  }

  public userWithToken(token: string): User {
    return new User(this.login, this.endpoint, token)
  }
}
