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

    return results
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
