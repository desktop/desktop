import * as React from 'react'
import { IAutocompletionProvider } from './index'

/** Autocompletion provider for emoji. */
export default class EmojiAutocompletionProvider implements IAutocompletionProvider<string> {
  private emoji: Map<string, string>

  public constructor(emoji: Map<string, string>) {
    this.emoji = emoji
  }

  public getRegExp(): RegExp {
    return /(?:^|\n| )(?::)([a-z0-9\\+\\-][a-z0-9_]*)?/g
  }

  public getAutocompletionItems(text: string): ReadonlyArray<string> {
    return Array.from(this.emoji.keys()).filter(e => e.startsWith(`:${text}`))
  }

  public renderItem(emoji: string) {
    return (
      <div className='emoji' key={emoji}>
        <img className='icon' src={this.emoji.get(emoji)}/>
        <div className='title'>{emoji}</div>
      </div>
    )
  }
}
