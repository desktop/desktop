/**
 * A representation of an 'author'. In reality we're
 * talking about co-authors here but the representation
 * is general purpose.
 *
 * For visualization purposes this object represents a
 * string such as
 *
 *  Foo Bar <foo@bar.com>
 *
 * Additionally it includes an optional username which is
 * solely for presentation purposes inside AuthorInput
 */
export interface IAuthor {
  /** The author real name */
  readonly name: string

  /** The author email address */
  readonly email: string

  /**
   * The GitHub.com or GitHub Enterprise login for
   * this author or null if that information is not
   * available.
   */
  readonly username: string | null
}
