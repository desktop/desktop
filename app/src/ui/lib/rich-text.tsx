import * as React from 'react'

const EmojiRegex = /(:.*?:)/g
const UsernameRegex = /@[a-zA-Z0-9\-]*/g

interface IRichTextProps {
  readonly className?: string
  readonly emoji: Map<string, string>
  readonly children?: string
}

/**
 * A component which replaces any emoji shortcuts (e.g., :+1:) in its child text
 * with the appropriate image tag.
 */
export class RichText extends React.Component<IRichTextProps, void> {
  public render() {
    const children = this.props.children as string || ''
    return (
      <div className={this.props.className}>
        {emojificationNexus(children, this.props.emoji)}
      </div>
    )
  }
}

/** Shoutout to @robrix's naming expertise. */
function emojificationNexus(str: string, emoji: Map<string, string>): JSX.Element | null {
  // If we've been given an empty string then return null so that we don't end
  // up introducing an extra empty <span>.
  if (!str.length) { return null }

  const pieces = str.split(EmojiRegex)
  const elements = pieces.map((fragment, i) => {
    const path = emoji.get(fragment)
    if (path) {
      return <img key={i} alt={fragment} title={fragment} className='emoji' src={path}/>
    } else {
      const innerPieces = fragment.split(UsernameRegex)
      const innerElements = innerPieces.map((fragment, j) => {
        if (fragment.startsWith('@')) {
          return <span key={j} className='username'>{fragment}</span>
        } else {
          return fragment
        }
      })
      return <span key={i}>{innerElements}</span>
    }
  })

  return <span>{elements}</span>
}
