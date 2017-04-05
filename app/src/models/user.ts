/** The data-only interface for User for transport across IPC. */
export interface IUser {
  readonly login: string
  readonly endpoint: string
  readonly emails: ReadonlyArray<string>
  readonly avatarURL: string
  readonly id: number
  readonly name: string
}

/**
 * A GitHub user, representing an entity that has interacted with a repository used by GitHub Desktop.
 *
 * These are read-only entities, and are typically associated with commits.
 */
export class User implements IUser {
  public readonly login: string
  public readonly endpoint: string
  public readonly emails: ReadonlyArray<string>
  public readonly avatarURL: string
  public readonly id: number
  public readonly name: string

  /** Create a new User from some JSON. */
  public static fromJSON(obj: IUser): User {
    return new User(obj.login, obj.endpoint, obj.emails, obj.avatarURL, obj.id, obj.name)
  }

  public constructor(login: string, endpoint: string, emails: ReadonlyArray<string>, avatarURL: string, id: number, name: string) {
    this.login = login
    this.endpoint = endpoint
    this.emails = emails
    this.avatarURL = avatarURL
    this.id = id
    this.name = name
  }
}
