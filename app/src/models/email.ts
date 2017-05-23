/** The data-only interface for Email for transport across IPC. */
export interface IEmail {

  readonly email: string
  /**
   * Represents whether GitHub has confirmed the user has access to this
   * email address. New users require a verified email address before
   * they can sign into GitHub Desktop.
   */
  readonly verified: boolean
  /**
   * Flag for the user's preferred email address. Other email addresses
   * are provided for associating commit authors with the one GitHub account.
   */
  readonly primary: boolean
}

/**
 * An email address associated with a GitHub account.
 */
export class Email implements IEmail {
  public readonly email: string
  public readonly verified: boolean
  public readonly primary: boolean

  /** Create a new Email from some JSON. */
  public static fromJSON(obj: IEmail): Email {
    return new Email(obj.email, obj.verified, obj.primary)
  }

  public constructor(email: string, verified: boolean = false, primary: boolean = false) {
    this.email = email
    this.verified = verified
    this.primary = primary
  }
}
