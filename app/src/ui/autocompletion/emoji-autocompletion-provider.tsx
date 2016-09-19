import * as React from 'react'
import { IAutocompletionProvider } from './index'
import { escapeRegExp } from '../lib/escape-regex'

export interface IEmojiHit {
  emoji: string,
  matchStart: number,
  matchLength: number
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

    // empty strings is falsy
    if (!text) {
      return Array.from(this.emoji.keys())
        .map<IEmojiHit>(emoji => { return { emoji: emoji, matchStart: 0, matchLength: 0 } })
    }

    const expr = new RegExp(escapeRegExp(text), 'i')
    const results = new Array<IEmojiHit>()

    for (const emoji of this.emoji.keys()) {
      const match = expr.exec(emoji)
      if (!match) { continue }

      results.push({ emoji, matchStart: match.index, matchLength: match[0].length })
    }

    // Naive emoji result sorting
    return results.sort((x, y) => {
      // Longer matches are sorted before shorter matches
      if (x.matchLength > y.matchLength) { return -1 }
      if (x.matchLength < y.matchLength) { return 1 }

      // Matches closer to the start of the string are sorted
      // before matches further into the string
      if (x.matchStart < y.matchStart) { return -1 }
      if (x.matchStart > y.matchStart) { return 1 }

      // Emojis names are all (ironically) in US English so we'll use
      // that as the last effort way of sorting them and we'll use
      // natural sort such that clock1... and friends are sorted correctly
      return x.emoji.localeCompare(y.emoji, 'en-US', { numeric: true })
    })
  }

  public renderItem(hit: IEmojiHit) {
    const emoji = hit.emoji
    return (
      <div className='emoji' key={emoji}>
        <img className='icon' src={this.emoji.get(emoji)}/>
        <div className='title'>{emoji}</div>
      </div>
    )
  }

  public getCompletionText(item: IEmojiHit) {
    return item.emoji
  }
}
