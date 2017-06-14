import * as React from 'react'
import { IAvatarUser } from '../../models/avatar'

const DefaultAvatarURL = `file:///${__dirname}/static/default-avatar.png`


interface IAvatarProps {
  /** The user whose avatar should be displayed. */
  readonly user?: IAvatarUser

  /** The title of the avatar. Defaults to the name and email. */
  readonly title?: string
}

/** A component for displaying a user avatar. */
export class Avatar extends React.Component<IAvatarProps, void> {
  private getTitle(): string {
    if (this.props.title) {
      return this.props.title
    }

    const user = this.props.user
    if (user) {
      const name = user.name
      if (name) {
        return `${name} <${user.email}>`
      } else {
        return user.email
      }
    }

    return 'Unknown user'
  }

  public render() {
    const url = this.props.user ? this.props.user.avatarURL : DefaultAvatarURL
    const title = this.getTitle()
    const ariaLabel = this.props.user
      ? `Avatar for ${this.props.user.name || this.props.user.email}`
      : `Avatar for unknown user`

    return (
      <span title={title} className='avatar-container'>
        <img className='avatar' title={title} src={url} alt={title} aria-label={ariaLabel} />
      </span>
    )
  }
}
