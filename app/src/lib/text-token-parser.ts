import { Repository } from '../models/repository'
import { GitHubRepository } from '../models/github-repository'
import { getHTMLURL } from './api'

export enum TokenType {
  Text,
  Emoji,
  Issue,
  Mention,
  Link,
}

export type IssueMatch = {
  readonly kind: TokenType.Issue,
  readonly text: string,
  readonly id: number,
  readonly url?: string,
}

export type MentionMatch = {
  readonly kind: TokenType.Mention,
  readonly text: string,
  readonly name: string,
  readonly url?: string,
}

export type EmojiMatch = {
  readonly kind: TokenType.Emoji,
  readonly text: string,
}

export type HyperlinkMatch = {
  readonly kind: TokenType.Link,
  readonly text: string,
  readonly url?: string,
}

export type PlainText = {
  readonly kind: TokenType.Text,
  readonly text: string,
}

export type TokenResult = PlainText | IssueMatch | MentionMatch | EmojiMatch | HyperlinkMatch

type LookupResult = {
  nextIndex: number
}

const emojiRegex = /:.*?:/
const issueRegex = /#[0-9]+/
const mentionRegex = /@[a-zA-Z0-9\-]+/
const hyperlinkRegex = /^(http(s?))\:\/\//

/**
 * A look-ahead tokenizer designed for scanning commit messages for emoji, issues and mentions.
 */
export class Tokenizer {

  private readonly emoji?: Map<string, string>
  private readonly repository: GitHubRepository | null

  private _results = new Array<TokenResult>()
  private _currentString = ''

  public constructor(emoji?: Map<string, string>, repository?: Repository) {
    this.emoji = emoji

    if (repository) {
      this.repository = repository.gitHubRepository
    }
  }

  private reset() {
    this._results = new Array<TokenResult>()
    this._currentString = ''
  }

  private append(character: string) {
    this._currentString += character
  }

  private flush() {
    if (this._currentString.length) {
      this._results.push({ kind: TokenType.Text, text: this._currentString })
      this._currentString = ''
    }
  }

  private peek(): string | null {
    if (this._currentString.length) {
      return this._currentString[this._currentString.length - 1]
    }
    return null
  }

  private scanForEndOfWord(text: string, index: number): number {
    const indexOfNextNewline = text.indexOf('\n', index + 1)
    const indexOfNextSpace = text.indexOf(' ', index + 1)

    if (indexOfNextNewline > -1 && indexOfNextSpace > -1) {
      // if we find whitespace and a newline, take whichever is closest
      if (indexOfNextNewline < indexOfNextSpace) {
        return indexOfNextNewline
      } else {
        return indexOfNextSpace
      }
    }

    // favouring newlines over whitespace here because people often like to
    // use mentions or issues at the end of a sentence.
    if (indexOfNextNewline > -1) {
      return indexOfNextNewline
    }

    if (indexOfNextSpace > -1) {
      return indexOfNextSpace
    }

    // as a fallback use the entire remaining string
    return text.length
  }

  private scanForEmoji(text: string, index: number): LookupResult | null {
    const nextIndex = this.scanForEndOfWord(text, index)
    const maybeEmoji = text.slice(index, nextIndex)
    if (emojiRegex.exec(maybeEmoji)) {
      this.flush()
      this._results.push({ kind: TokenType.Emoji, text: maybeEmoji })
      return { nextIndex }
    }

    return null
  }

  private scanForIssue(text: string, index: number): LookupResult | null {
    const nextIndex = this.scanForEndOfWord(text, index)
    const maybeIssue = text.slice(index, nextIndex)
    if (issueRegex.exec(maybeIssue)) {
      this.flush()
      const id = parseInt(maybeIssue.substr(1), 10)
      const url = this.repository ? `${this.repository.htmlURL}/issues/${id}` : undefined
      this._results.push({ kind: TokenType.Issue, text: maybeIssue, id, url })
      return { nextIndex }
    }

    return null
  }

  private scanForMention(text: string, index: number): LookupResult | null {
    // to ensure this isn't part of an email address, peek at the previous
    // character - if something is found and it's not whitespace, bail out
    const lastItem = this.peek()
    if (lastItem && lastItem !== ' ') { return null }

    const nextIndex = this.scanForEndOfWord(text, index)
    const maybeMention = text.slice(index, nextIndex)
    if (mentionRegex.exec(maybeMention)) {
      this.flush()
      const name = maybeMention.substr(1)
      const url = this.repository ? `${getHTMLURL(this.repository.endpoint)}/${name}` : undefined
      this._results.push({ kind: TokenType.Mention, text: maybeMention, name, url })
      return { nextIndex }
    }

    return null
  }

  private scanForHyperlink(text: string, index: number): LookupResult | null {
    // to ensure this isn't just the part of some word - if something is
    // found and it's not whitespace, bail out
    const lastItem = this.peek()
    if (lastItem && lastItem !== ' ') {
      return null
    }

    const nextIndex = this.scanForEndOfWord(text, index)
    const maybeHyperlink = text.slice(index, nextIndex)
    if (hyperlinkRegex.exec(maybeHyperlink)) {
      this.flush()

      if (this.repository && this.repository.htmlURL) {
        const repositoryCompare = this.repository.htmlURL.toLowerCase()

        // looking to see if this matches the issue URL template for the current repository
        const regex = new RegExp(`${repositoryCompare}\/issues\/([0-9]{1,})`)
        const issueMatch = regex.exec(maybeHyperlink)
        if (issueMatch) {
          const idText = issueMatch[1]
          const id = parseInt(idText, 10)
          this._results.push({ kind: TokenType.Issue,  url: maybeHyperlink, id, text: `#${idText}` })
        }
      } else {
        this._results.push({ kind: TokenType.Link, url: maybeHyperlink, text: maybeHyperlink })
        return { nextIndex }
      }
    }

    return null
  }

  /**
   * Scan the string for tokens that match with entities an application
   * might be interested in.
   *
   * @returns an array of tokens representing the scan results.
   */
  public tokenize(text: string): ReadonlyArray<TokenResult> {
    this.reset()

    let i = 0
    let match: LookupResult | null = null

    while (i < text.length) {
      const element = text[i]
      switch (element) {
        case ':':
          match = this.scanForEmoji(text, i)
          if (match) {
            i = match.nextIndex
          } else {
            this.append(element)
            i++
          }
          break

        case '#':
          match = this.scanForIssue(text, i)
          if (match) {
            i = match.nextIndex
          } else {
            this.append(element)
            i++
          }
          break

        case '@':
          match = this.scanForMention(text, i)
          if (match) {
            i = match.nextIndex
          } else {
            this.append(element)
            i++
          }
          break

        case 'h':
          match = this.scanForHyperlink(text, i)
          if (match) {
            i = match.nextIndex
          } else {
            this.append(element)
            i++
          }
          break

        default:
          this.append(element)
          i++
          break
      }
    }

    this.flush()
    return this._results
  }
}
