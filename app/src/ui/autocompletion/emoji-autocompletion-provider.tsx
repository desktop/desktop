import * as React from 'react'
import { IAutocompletionProvider } from './index'
import { compare } from '../../lib/compare'
import { DefaultMaxHits } from './common'
import { Emoji } from '../../lib/emoji'

const sanitizeEmoji = (emoji: string) => emoji.replaceAll(':', '')

/**
 * Interface describing a autocomplete match for the given search
 * input passed to EmojiAutocompletionProvider#getAutocompletionItems.
 */
export interface IEmojiHit {
  /** A human-readable markdown representation of the emoji, ex :heart: */
  readonly emoji: string

  /**
   * The offset into the emoji string where the
   * match started, used for highlighting matches.
   */
  readonly matchStart: number

  /**
   * The length of the match or zero if the filter
   * string was empty, causing the provider to return
   * all possible matches.
   */
  readonly matchLength: number
}

/** Autocompletion provider for emoji. */
export class EmojiAutocompletionProvider
  implements IAutocompletionProvider<IEmojiHit>
{
  public readonly kind = 'emoji'

  private readonly allEmoji: Map<string, Emoji>

  public constructor(emoji: Map<string, Emoji>) {
    this.allEmoji = emoji
  }

  public getRegExp(): RegExp {
    return /(?:^|\n| )(?::)([a-z\d\\+-][a-z\d_]*)?/g
  }

  public async getAutocompletionItems(
    text: string,
    maxHits = DefaultMaxHits
  ): Promise<ReadonlyArray<IEmojiHit>> {
    // This is the happy path to avoid sorting and matching
    // when the user types a ':'. We want to open the popup
    // with suggestions as fast as possible.
    if (text.length === 0) {
      return [...this.allEmoji.keys()]
        .map(emoji => ({ emoji, matchStart: 0, matchLength: 0 }))
        .slice(0, maxHits)
    }

    const results = new Array<IEmojiHit>()
    const needle = text.toLowerCase()

    for (const emoji of this.allEmoji.keys()) {
      const index = emoji.indexOf(needle)
      if (index !== -1) {
        results.push({ emoji, matchStart: index, matchLength: needle.length })
      }
    }

    // Naive emoji result sorting
    //
    // Matches closer to the start of the string are sorted
    // before matches further into the string
    //
    // Longer matches relative to the emoji length is sorted
    // before the same match in a longer emoji
    // (:heart over :heart_eyes)
    //
    // If both those start and length are equal we sort
    // alphabetically
    return results
      .sort(
        (x, y) =>
          compare(x.matchStart, y.matchStart) ||
          compare(x.emoji.length, y.emoji.length) ||
          compare(x.emoji, y.emoji)
      )
      .slice(0, maxHits)
  }

  public getItemAriaLabel(hit: IEmojiHit): string {
    const emoji = this.allEmoji.get(hit.emoji)
    const sanitizedEmoji = sanitizeEmoji(hit.emoji)
    const emojiDescription = emoji?.description ?? sanitizedEmoji
    return emojiDescription === sanitizedEmoji
      ? emojiDescription
      : `${emojiDescription}, ${sanitizedEmoji}`
  }

  public renderItem(hit: IEmojiHit) {
    const emoji = this.allEmoji.get(hit.emoji)

    return (
      <div className="emoji" key={hit.emoji}>
        <img
          className="icon"
          src={emoji?.url}
          alt={emoji?.description ?? hit.emoji}
        />
        {this.renderHighlightedTitle(hit)}
      </div>
    )
  }

  private renderHighlightedTitle(hit: IEmojiHit) {
    const emoji = sanitizeEmoji(hit.emoji)

    if (!hit.matchLength) {
      return <div className="title">{emoji}</div>
    }

    // Offset the match start by one to account for the leading ':' that was
    // removed from the emoji string
    const matchStart = hit.matchStart - 1

    return (
      <div className="title">
        {emoji.substring(0, matchStart)}
        <mark>{emoji.substring(matchStart, matchStart + hit.matchLength)}</mark>
        {emoji.substring(matchStart + hit.matchLength)}
      </div>
    )
  }

  public getCompletionText(item: IEmojiHit) {
    return item.emoji
  }
}
