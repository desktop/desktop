import * as React from 'react'
import { IAutocompletionProvider } from './index'
import { compare } from '../../lib/compare'
import { DefaultMaxHits } from './common'

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
  implements IAutocompletionProvider<IEmojiHit> {
  public readonly kind = 'emoji'

  private readonly emoji: Map<string, string>

  public constructor(emoji: Map<string, string>) {
    this.emoji = emoji
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
      return [...this.emoji.keys()]
        .map(emoji => ({ emoji, matchStart: 0, matchLength: 0 }))
        .slice(0, maxHits)
    }

    const results = new Array<IEmojiHit>()
    const needle = text.toLowerCase()

    for (const emoji of this.emoji.keys()) {
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

  public renderItem(hit: IEmojiHit) {
    const emoji = hit.emoji

    return (
      <div className="emoji" key={emoji}>
        <img className="icon" src={this.emoji.get(emoji)} />
        {this.renderHighlightedTitle(hit)}
      </div>
    )
  }

  private renderHighlightedTitle(hit: IEmojiHit) {
    const emoji = hit.emoji

    if (!hit.matchLength) {
      return <div className="title">{emoji}</div>
    }

    return (
      <div className="title">
        {emoji.substr(0, hit.matchStart)}
        <mark>{emoji.substr(hit.matchStart, hit.matchLength)}</mark>
        {emoji.substr(hit.matchStart + hit.matchLength)}
      </div>
    )
  }

  public getCompletionText(item: IEmojiHit) {
    return item.emoji
  }
}
