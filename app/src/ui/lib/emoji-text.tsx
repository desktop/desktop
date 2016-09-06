import * as React from 'react'

interface IEmojiTextProps {
  readonly className?: string
  readonly emoji: Map<string, string>
  readonly children?: string
}

/**
 * A component which replaces any emoji shortcuts (e.g., :+1:) in its child text
 * with the appropriate image tag.
 */
export default class EmojiText extends React.Component<IEmojiTextProps, void> {
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

  const pieces = str.split(/(:.*?:)/g)
  const elements = pieces.map(fragment => {
    const path = emoji.get(fragment)
    if (path) {
      return <img style={{ width: 16, height: 16, verticalAlign: 'middle' }} src={path}/>
    } else {
      return fragment
    }
  })

  return <span>{elements}</span>
}
