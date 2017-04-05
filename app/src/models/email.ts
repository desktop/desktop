/** The data-only interface for Email for transport across IPC. */
export interface IEmail {
  readonly email: string
  readonly verified: boolean
  readonly primary: boolean
  readonly visibility: 'public' | 'private'
}

/**
 * An email address associated with a GitHub account.
 */
export class Email implements IEmail {
  public readonly email: string
  public readonly verified: boolean
  public readonly primary: boolean
  public readonly visibility: 'public' | 'private'


  /** Create a new Email from some JSON. */
  public static fromJSON(obj: IEmail): Email {
    return new Email(obj.email, obj.verified, obj.primary, obj.visibility)
  }

  public constructor(email: string, verified: boolean = false, primary: boolean = false, visibility: 'public' | 'private') {
    this.email = email
    this.verified = verified
    this.primary = primary
    this.visibility = visibility
  }
}
