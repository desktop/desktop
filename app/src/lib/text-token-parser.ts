import { Repository } from '../models/repository'
import { GitHubRepository } from '../models/github-repository'
import { getHTMLURL } from './api'

export enum TokenType {
  /*
   * A token that should be rendered as-is, without any formatting.
   */
  Text,
  /*
   * A token representing an emoji character - should be replaced with an image.
   */
  Emoji,
  /*
   * A token representing a generic link - should be drawn as a hyperlink
   * to launch the browser.
   */
  Link,
}

export type EmojiMatch = {
  readonly kind: TokenType.Emoji,
  // The alternate text to display with the image, e.g. ':+1:'
  readonly text: string,
  // The path on disk to the image.
  readonly path: string,
}

export type HyperlinkMatch = {
  readonly kind: TokenType.Link,
  // The text to display inside the rendered link, e.g. @shiftkey
  readonly text: string,
  // The URL to launch when clicking on the link
  readonly url: string,
}

export type PlainText = {
  readonly kind: TokenType.Text,
  // The text to render.
  readonly text: string,
}

export type TokenResult = PlainText | EmojiMatch | HyperlinkMatch

type LookupResult = {
  nextIndex: number
}

/**
 * A look-ahead tokenizer designed for scanning commit messages for emoji, issues, mentions and links.
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
    if (!this.emoji) { return null }

    const nextIndex = this.scanForEndOfWord(text, index)
    const maybeEmoji = text.slice(index, nextIndex)
    if (!/:.*?:/.exec(maybeEmoji)) { return null }

    const path = this.emoji.get(maybeEmoji)
    if (!path) { return null }

    this.flush()
    this._results.push({ kind: TokenType.Emoji, text: maybeEmoji, path })
    return { nextIndex }
  }

  private scanForIssue(text: string, index: number): LookupResult | null {
    // don't lookup issues for non-GitHub repositories
    if (!this.repository) { return null }

    const nextIndex = this.scanForEndOfWord(text, index)
    const maybeIssue = text.slice(index, nextIndex)
    if (!/#[0-9]+/.exec(maybeIssue)) { return null }

    this.flush()
    const id = parseInt(maybeIssue.substr(1), 10)
    const url = `${this.repository.htmlURL}/issues/${id}`
    this._results.push({ kind: TokenType.Link, text: maybeIssue, url })
    return { nextIndex }
  }

  private scanForMention(text: string, index: number): LookupResult | null {
    // don't lookup mentions for non-GitHub repositories
    if (!this.repository) { return null }

    // to ensure this isn't part of an email address, peek at the previous
    // character - if something is found and it's not whitespace, bail out
    const lastItem = this.peek()
    if (lastItem && lastItem !== ' ') { return null }

    const nextIndex = this.scanForEndOfWord(text, index)
    const maybeMention = text.slice(index, nextIndex)
    if (!/@[a-zA-Z0-9\-]+/.exec(maybeMention)) { return null }

    this.flush()
    const name = maybeMention.substr(1)
    const url = `${getHTMLURL(this.repository.endpoint)}/${name}`
    this._results.push({ kind: TokenType.Link, text: maybeMention, url })
    return { nextIndex }
  }

  private scanForHyperlink(text: string, index: number): LookupResult | null {
    // to ensure this isn't just the part of some word - if something is
    // found and it's not whitespace, bail out
    const lastItem = this.peek()
    if (lastItem && lastItem !== ' ') { return null }

    const nextIndex = this.scanForEndOfWord(text, index)
    const maybeHyperlink = text.slice(index, nextIndex)
    if (!/^(http(s?))\:\/\//.exec(maybeHyperlink)) { return null }

    this.flush()
    if (this.repository && this.repository.htmlURL) {
      // case-insensitive regex to see if this matches the issue URL template for the current repository
      const regex = new RegExp(`${this.repository.htmlURL}\/issues\/([0-9]{1,})`, 'i')
      const issueMatch = regex.exec(maybeHyperlink)
      if (issueMatch) {
        const idText = issueMatch[1]
        this._results.push({ kind: TokenType.Link,  url: maybeHyperlink, text: `#${idText}` })
        return { nextIndex }
      }
    }

    // just render a hyperlink with the full URL
    this._results.push({ kind: TokenType.Link, url: maybeHyperlink, text: maybeHyperlink })
    return { nextIndex }
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
