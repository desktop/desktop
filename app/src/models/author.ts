/** This represents known authors (authors for which there is a GitHub user) */
export type KnownAuthor = {
  readonly kind: 'known'

  /** The real name of the author */
  readonly name: string

  /** The email address of the author */
  readonly email: string

  /**
   * The GitHub.com or GitHub Enterprise login for
   * this author or null if that information is not
   * available.
   */
  readonly username: string | null
}

/** This represents unknown authors (for which we still don't know a GitHub user) */
export type UnknownAuthor = {
  readonly kind: 'unknown'

  /**
   * The GitHub.com or GitHub Enterprise login for this author.
   */
  readonly username: string

  /** Whether we're currently looking for a GitHub user or if search failed */
  readonly state: 'searching' | 'error'
}

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
export type Author = KnownAuthor | UnknownAuthor

/** Checks whether or not a given author is a known user */
export function isKnownAuthor(author: Author): author is KnownAuthor {
  return author.kind === 'known'
}
