import * as React from 'react'

import { LinkButton } from './link-button'
import { Repository } from '../../models/repository'
import { getHTMLURL } from '../../lib/api'

const EmojiRegex = /(:.*?:)/g
const UsernameOrIssueRegex = /(\w*@[a-zA-Z0-9\-]*)|(#[0-9]{1,})/g

interface IRichTextProps {
  readonly className?: string

  /** A lookup of emoji characters to map to image resources */
  readonly emoji: Map<string, string>

  /** The raw text to inspect for things to highlight */
  readonly children?: string

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
 * with hyperlink tags if it has an event handler to invoke.
 */
export class RichText extends React.Component<IRichTextProps, void> {
  public render() {
    const children = this.props.children as string || ''
    return (
      <div className={this.props.className}>
        {emojificationNexus(children, this.props.emoji, this.props.repository)}
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
      return usernameNexus(fragment, i, repository)
    }
  })

  return <span>{elements}</span>
}

function usernameNexus(str: string, i: number, repository?: Repository): ReadonlyArray<JSX.Element | string> {
  if (!repository || !repository.gitHubRepository) {
    return [ str ]
  }

  const pieces = str.split(UsernameOrIssueRegex)

  const results: Array<JSX.Element | string> = [ ]

  for (let j = 0; j < pieces.length; j++) {
    const fragment = pieces[j]

    // because we are using an | to build up this regex here, we
    // see undefined entries to represent matches for the "other"
    // expression in the regex. these can be safely ignored.
    if (fragment === undefined) {
      continue
    }

    const innerKey = `${i}-${j}`

    if (fragment.startsWith('@')) {
      const user = fragment.substr(1)
      const host = getHTMLURL(repository.gitHubRepository.endpoint)
      const url = `${host}/${user}`

      results.push(<LinkButton
        key={innerKey}
        uri={url}>
          {fragment}
        </LinkButton>)
    } else if (fragment.startsWith('#')) {
      const id = parseInt(fragment.substr(1), 10)
      const url = `${repository.gitHubRepository.htmlURL}/issues/${id}`
      results.push(<LinkButton
        key={innerKey}
        uri={url}>
          {fragment}
        </LinkButton>)
    } else {
      results.push(fragment)
    }
  }

  return results
}
