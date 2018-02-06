import * as React from 'react'

import { LinkButton } from './link-button'
import { Repository } from '../../models/repository'
import { Tokenizer, TokenType } from '../../lib/text-token-parser'
import { assertNever } from '../../lib/fatal-error'

interface IRichTextProps {
  readonly className?: string

  /** A lookup of emoji characters to map to image resources */
  readonly emoji: Map<string, string>

  /** The raw text to inspect for things to highlight */
  readonly text: string

  /** Should URLs be rendered as clickable links. Default true. */
  readonly renderUrlsAsLinks?: boolean

  /**
   * The repository to use as the source for URLs for the rich text.
   *
   * If not specified, or the repository is a non-GitHub repository,
   * no link highlighting is performed.
   */
  readonly repository?: Repository
}

/**
 * A component which replaces any emoji shortcuts (e.g., :+1:) in its child text
 * with the appropriate image tag, and also highlights username and issue mentions
 * with hyperlink tags if it has a repository to read.
 */
export class RichText extends React.Component<IRichTextProps, {}> {
  public render() {
    const str = this.props.text

    // If we've been given an empty string then return null so that we don't end
    // up introducing an extra empty <span>.
    if (!str.length) {
      return null
    }

    const tokenizer = new Tokenizer(this.props.emoji, this.props.repository)

    const elements = tokenizer.tokenize(str).map((token, index) => {
      switch (token.kind) {
        case TokenType.Emoji:
          return (
            <img
              key={index}
              alt={token.text}
              className="emoji"
              src={token.path}
            />
          )
        case TokenType.Link:
          if (this.props.renderUrlsAsLinks !== false) {
            return (
              <LinkButton key={index} uri={token.url} children={token.text} />
            )
          } else {
            return <span key={index}>{token.text}</span>
          }
        case TokenType.Text:
          return <span key={index}>{token.text}</span>
        default:
          return assertNever(token, 'Unknown token type: ${r.kind}')
      }
    })

    return (
      <div className={this.props.className} title={str}>
        {elements}
      </div>
    )
  }
}
