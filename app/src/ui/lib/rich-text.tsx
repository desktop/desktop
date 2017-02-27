import * as React from 'react'

import { LinkButton } from './link-button'
import { Repository } from '../../models/repository'
import { getHTMLURL } from '../../lib/api'

const EmojiRegex = /(:.*?:)/g
const UsernameOrIssueRegex = /(\w*@[a-zA-Z0-9\-]+)|(#[0-9]+)/g

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

/** Shoutout to @robrix's naming expertise. */
function emojificationNexus(str: string, emoji: Map<string, string>, repository?: Repository): JSX.Element | null {
  // If we've been given an empty string then return null so that we don't end
  // up introducing an extra empty <span>.
  if (!str.length) { return null }

  const pieces = str.split(EmojiRegex)
  const elements = pieces.map((fragment, i) => {
    const path = emoji.get(fragment)
    if (path) {
      return [ <img key={i} alt={fragment} title={fragment} className='emoji' src={path}/> ]
    } else {
      return renderUsernameOrIssues(fragment, i, repository)
    }
  })

  return <span>{elements}</span>
}

function renderUsernameOrIssues(str: string, i: number, repository?: Repository): ReadonlyArray<JSX.Element | string> {
  if (!repository) { return [ str ] }

  const repo = repository.gitHubRepository

  if (!repo) { return [ str ] }

  const pieces = str.split(UsernameOrIssueRegex)

  const results = new Array<JSX.Element | string>()

  pieces.forEach((piece, j) => {
    // because we are using an | to build up this regex here, we
    // see undefined entries to represent matches for the "other"
    // expression in the regex. these can be safely ignored.
    if (!piece) { return }

    const innerKey = `${i}-${j}`

    if (piece.startsWith('@')) {
      const user = piece.substr(1)
      const host = getHTMLURL(repo.endpoint)
      const url = `${host}/${user}`

      results.push(<LinkButton
        key={innerKey}
        uri={url}
        children={piece} />)
    } else if (piece.startsWith('#')) {
      const id = parseInt(piece.substr(1), 10)
      const url = `${repo.htmlURL}/issues/${id}`
      results.push(<LinkButton
        key={innerKey}
        uri={url}
        children={piece} />)
    } else {
      results.push(piece)
    }
  })

  return results
}
