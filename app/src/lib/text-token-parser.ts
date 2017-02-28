export enum TokenType {
  Text,
  Emoji,
  Issue,
  Mention,
}

export type TokenResult = {
  readonly type: TokenType,
  readonly text: string,
}

type LookupResult = {
  nextIndex: number
}

const emojiRegex = /:.*?:/
const issueRegex = /#[0-9]+/
const mentionRegex = /@[a-zA-Z0-9\-]+/

export class Tokenizer {

  private readonly _results = new Array<TokenResult>()

  private currentStringArray = ''

  public get results(): ReadonlyArray<TokenResult> {
    return this._results
  }

  public reset() {
    while (this._results.length) {
      this._results.pop()
    }
    this.currentStringArray = ''
  }

  private append(character: string) {
    this.currentStringArray += character
  }

  private flush() {
    if (this.currentStringArray.length) {
      this._results.push({ type: TokenType.Text, text: this.currentStringArray })
      this.currentStringArray = ''
    }
  }

  private peek(): string | null {
    if (this.currentStringArray.length) {
      return this.currentStringArray[this.currentStringArray.length - 1]
    }
    return null
  }

  private scanForNextWhitespaceIndex(text: string, index: number): number {
    const indexOfNextNewline = text.indexOf('\n', index + 1)
    const indexOfNextSpace = text.indexOf(' ', index + 1)

    if (indexOfNextNewline > -1 && indexOfNextSpace > -1) {
      if (indexOfNextNewline < indexOfNextSpace) {
        return indexOfNextNewline
      } else {
        return indexOfNextSpace
      }
    } else if (indexOfNextNewline > -1) {
      return indexOfNextNewline
    } else if (indexOfNextSpace > -1) {
      return indexOfNextSpace
    } else {
      // as a fallback use the entire remaining string
      return text.length
    }
  }

  private scanForEmoji(text: string, index: number): LookupResult | null {
    const nextIndex = this.scanForNextWhitespaceIndex(text, index)
    const maybeEmoji = text.slice(index, nextIndex)
    if (emojiRegex.exec(maybeEmoji)) {
      this.flush()
      this._results.push({ type: TokenType.Emoji, text: maybeEmoji })
      return { nextIndex }
    } else {
      this.currentStringArray += ':'
      return null
    }
  }

  private scanForIssue(text: string, index: number): LookupResult | null {
    const nextIndex = this.scanForNextWhitespaceIndex(text, index)
    const maybeIssue = text.slice(index, nextIndex)
    if (issueRegex.exec(maybeIssue)) {
      this.flush()
      this._results.push({ type: TokenType.Issue, text: maybeIssue })
      return { nextIndex }
    } else {
      this.append('#')
      return null
    }
  }

  private scanForMention(text: string, index: number): LookupResult | null {
    const lastItem = this.peek()
    if (lastItem !== ' ') {
      this.append('@')
      return null
    }

    const nextIndex = this.scanForNextWhitespaceIndex(text, index)
    const maybeMention = text.slice(index, nextIndex)
    if (mentionRegex.exec(maybeMention)) {
      this.flush()
      this._results.push({ type: TokenType.Mention, text: maybeMention })
      return { nextIndex }
    } else {
      this.append('@')
      return null
    }
  }

  public tokenize(text: string) {
    let i = 0;

    let match: LookupResult | null = null

    while (i < text.length) {
      let element = text[i]
      switch (element) {
        case ':':
          match = this.scanForEmoji(text, i)
          if (match) {
            i = match.nextIndex
          } else {
            i++
          }
          break

        case '#':
          match = this.scanForIssue(text, i)
          if (match) {
            i = match.nextIndex
          } else {
            i++
          }
          break

        case '@':
          match = this.scanForMention(text, i)
          if (match) {
            i = match.nextIndex
          } else {
            i++
          }
          break


        default:
          this.currentStringArray += element
          i++
          break
      }
    }

    this.flush()
  }
}
