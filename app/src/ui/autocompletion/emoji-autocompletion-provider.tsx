import * as React from 'react'
import { IAutocompletionProvider } from './index'

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
export default class EmojiAutocompletionProvider implements IAutocompletionProvider<IEmojiHit> {
  private emoji: Map<string, string>

  public constructor(emoji: Map<string, string>) {
    this.emoji = emoji
  }

  public getRegExp(): RegExp {
    return /(?:^|\n| )(?::)([a-z0-9\\+\\-][a-z0-9_]*)?/g
  }

  public getAutocompletionItems(text: string): ReadonlyArray<IEmojiHit> {

    // Empty strings is falsy, this is the happy path to avoid
    // sorting and matching when the user types a ':'. We want
    // to open the popup with suggestions as fast as possible.
    if (!text) {
      return Array.from(this.emoji.keys())
        .map<IEmojiHit>(emoji => { return { emoji: emoji, matchStart: 0, matchLength: 0 } })
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
    return results.sort((x, y) => {
      // Matches closer to the start of the string are sorted
      // before matches further into the string
      if (x.matchStart < y.matchStart) { return -1 }
      if (x.matchStart > y.matchStart) { return 1 }

      // Longer matches relative to the emoji length is sorted
      // before the same match in a longer emoji
      // (:heart over :heart_eyes)
      if (x.emoji.length < y.emoji.length) { return -1 }
      if (x.emoji.length > y.emoji.length) { return 1 }

      // End with sorting them alphabetically
      if (x.emoji < y.emoji) { return -1 }
      if (x.emoji > y.emoji) { return 1 }

      return 0
    })
  }

  public renderItem(hit: IEmojiHit) {
    const emoji = hit.emoji

    const title = hit.matchLength > 0
      ? <div className='title'>
          {emoji.substr(0, hit.matchStart)}
          <mark>{emoji.substr(hit.matchStart, hit.matchLength)}</mark>
          {emoji.substr(hit.matchStart + hit.matchLength)}
        </div>
      : <div className='title'>{emoji}</div>

    return (
      <div className='emoji' key={emoji}>
        <img className='icon' src={this.emoji.get(emoji)}/>
        {title}
      </div>
    )
  }

  public getCompletionText(item: IEmojiHit) {
    return item.emoji
  }
}
