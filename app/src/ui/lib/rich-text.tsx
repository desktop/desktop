import * as React from 'react'

import { LinkButton } from './link-button'
import { Repository } from '../../models/repository'
import { GitHubRepository } from '../../models/github-repository'
import { getHTMLURL } from '../../lib/api'
import { Tokenizer, TokenType } from '../../lib/text-token-parser'

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
    return (
      <div className={this.props.className}>
        {emojificationNexus(this.props.text, this.props.emoji, this.props.repository)}
      </div>
    )
  }
}

function resolveGitHubRepository(repository?: Repository): GitHubRepository | null {
  if (!repository) { return null }
  return repository.gitHubRepository
}

function renderMention(fragment: string, index: number, repository?: Repository): JSX.Element | string {
  const repo = resolveGitHubRepository(repository)
  if (!repo) { return fragment }

  const user = fragment.substr(1)
  const host = getHTMLURL(repo.endpoint)
  const url = `${host}/${user}`

  return <LinkButton
    key={index}
    uri={url}
    children={fragment} />
}

function renderIssue(fragment: string, index: number, repository?: Repository): JSX.Element | string {
  const repo = resolveGitHubRepository(repository)
  if (!repo) { return fragment }

  const id = parseInt(fragment.substr(1), 10)
  const url = `${repo.htmlURL}/issues/${id}`
  return <LinkButton
    key={index}
    uri={url}
    children={fragment} />
}

function renderEmoji(fragment: string, index: number, emoji: Map<string, string>): JSX.Element | string {
  const path = emoji.get(fragment)
  if (path) {
    return <img key={index} alt={fragment} title={fragment} className='emoji' src={path}/>
  } else {
    return fragment
  }
}

/** Shoutout to @robrix's naming expertise. */
function emojificationNexus(str: string, emoji: Map<string, string>, repository?: Repository): JSX.Element | null {
  // If we've been given an empty string then return null so that we don't end
  // up introducing an extra empty <span>.
  if (!str.length) { return null }

  const tokenizer = new Tokenizer()

  const elements = tokenizer.tokenize(str).map((r, index) => {
    switch (r.type) {
      case TokenType.Emoji:
        return renderEmoji(r.text, index, emoji)
      case TokenType.Mention:
        return renderMention(r.text, index, repository)
      case TokenType.Issue:
        return renderIssue(r.text, index, repository)
      default:
        return r.text
    }
  })

  return <span>{elements}</span>
}
