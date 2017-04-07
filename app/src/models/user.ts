/**
 * A GitHub user, representing an entity that has interacted with a repository used by GitHub Desktop.
 *
 * These are read-only entities, and are typically associated with commits or mentions.
 */
export class User {
  /** The account name associated with the user */
  public readonly login: string
  /** The profile URL to render for this user */
  public readonly avatarURL: string
  /** The friendly name associated with the user */
  public readonly name: string

  public constructor(login: string, avatarURL: string, name: string) {
    this.login = login
    this.avatarURL = avatarURL
    this.name = name
  }
}
