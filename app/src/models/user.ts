/** The data-only interface for User for transport across IPC. */
export interface IUser {
  readonly login: string
  readonly avatarURL: string
  readonly name: string
}

/**
 * A GitHub user, representing an entity that has interacted with a repository used by GitHub Desktop.
 *
 * These are read-only entities, and are typically associated with commits or mentions.
 */
export class User implements IUser {
  /** The account name associated with the user */
  public readonly login: string
  /** The avatar URL to render for this user */
  public readonly avatarURL: string
  /** The name associated with the user */
  public readonly name: string

  /** Create a new User from some JSON. */
  public static fromJSON(obj: IUser): User {
    return new User(obj.login, obj.avatarURL, obj.name)
  }

  public constructor(login: string, avatarURL: string, name: string) {
    this.login = login
    this.avatarURL = avatarURL
    this.name = name
  }
}
