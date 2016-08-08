/** The data-only interface for User for transport across IPC. */
export interface IUser {
  readonly token: string
  readonly login: string
  readonly endpoint: string
  readonly email: string
  readonly avatarURL: string
}

/**
 * A GitHub user.
 */
export default class User implements IUser {
  public readonly token: string
  public readonly login: string
  public readonly endpoint: string
  public readonly email: string
  public readonly avatarURL: string

  /** Create a new User from some JSON. */
  public static fromJSON(obj: IUser): User {
    return new User(obj.login, obj.endpoint, obj.token, obj.email, obj.avatarURL)
  }

  public constructor(login: string, endpoint: string, token: string, email: string, avatarURL: string) {
    this.login = login
    this.endpoint = endpoint
    this.token = token
    this.email = email
    this.avatarURL = avatarURL
  }

  public withToken(token: string): User {
    return new User(this.login, this.endpoint, token, this.email, this.avatarURL)
  }
}
