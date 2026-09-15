/** Represents an emoji */
export type Emoji = {
  /**
   * The unicode string of the emoji if emoji is part of
   * the unicode specification. If missing this emoji is
   * a GitHub custom emoji such as :shipit:
   */
  readonly emoji?: string

  /** URL of the image of the emoji (alternative to the unicode character) */
  readonly url: string

  /** One or more human readable aliases for the emoji character */
  readonly aliases: ReadonlyArray<string>

  /** An optional, human readable, description of the emoji  */
  readonly description?: string
}
