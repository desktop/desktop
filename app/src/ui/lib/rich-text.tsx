import * as React from 'react'

import { LinkButton } from './link-button'
import { Repository } from '../../models/repository'
import { GitHubRepository } from '../../models/github-repository'
import { getHTMLURL } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'

import {
  Tokenizer,
  TokenType,
  IssueMatch,
  EmojiMatch,
  MentionMatch,
} from '../../lib/text-token-parser'

interface IRichTextProps {
  readonly className?: string

  /** A lookup of emoji characters to map to image resources */
  readonly emoji: Map<string, string>

  /** The raw text to inspect for things to highlight */
  readonly text: string

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
export class RichText extends React.Component<IRichTextProps, void> {
  public render() {
    const str = this.props.text

    // If we've been given an empty string then return null so that we don't end
    // up introducing an extra empty <span>.
    if (!str.length) { return null }

    const tokenizer = new Tokenizer()

    const elements = tokenizer.tokenize(str).map((r, index) => {
      switch (r.kind) {
        case TokenType.Emoji:
          return renderEmoji(r, index, this.props.emoji)
        case TokenType.Mention:
          return renderMention(r, index, this.props.repository)
        case TokenType.Issue:
          return renderIssue(r, index, this.props.repository)
        case TokenType.Text:
          return r.text
        default:
          return assertNever(r, 'Unknown token type: ${r.kind}')
      }
    })

    return (
      <div className={this.props.className}>
        <span>{elements}</span>
      </div>
    )
  }
}

function resolveGitHubRepository(repository?: Repository): GitHubRepository | null {
  if (!repository) { return null }
  return repository.gitHubRepository
}

function renderMention(match: MentionMatch, index: number, repository?: Repository): JSX.Element | string {
  const repo = resolveGitHubRepository(repository)
  if (!repo) { return match.text }

  const url = `${getHTMLURL(repo.endpoint)}/${match.name}`

  return <LinkButton
    key={index}
    uri={url}
    children={match.text} />
}

function renderIssue(match: IssueMatch, index: number, repository?: Repository): JSX.Element | string {
  const repo = resolveGitHubRepository(repository)
  if (!repo) { return match.text }

  const url = `${repo.htmlURL}/issues/${match.id}`
  return <LinkButton
    key={index}
    uri={url}
    children={match.text} />
}

function renderEmoji(match: EmojiMatch, index: number, emoji: Map<string, string>): JSX.Element | string {
  const path = emoji.get(match.text)
  if (path) {
    return <img key={index} alt={match.text} title={match.text} className='emoji' src={path}/>
  } else {
    return match.text
  }
}
