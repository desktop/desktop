import * as React from 'react'

const DefaultAvatarURL = 'https://github.com/hubot.png'

/** The minimum properties we need in order to display a user's avatar. */
export interface IAvatarUser {
  /** The user's email. */
  readonly email: string

  /** The user's avatar URL. */
  readonly avatarURL: string
}

interface IAvatarProps {
  /** The user whose avatar should be displayed. */
  readonly user?: IAvatarUser

  /** The title of the avatar. Defaults to `email` if provided. */
  readonly title?: string
}

/** A component for displaying a user avatar. */
export class Avatar extends React.Component<IAvatarProps, void> {
  private getTitle(): string {
    if (this.props.title) {
      return this.props.title
    }

    if (this.props.user) {
      return this.props.user.email
    }

    return 'Unknown user'
  }

  public render() {
    const url = this.props.user ? this.props.user.avatarURL : DefaultAvatarURL
    const title = this.getTitle()

    return (
      <img className='avatar' title={title} src={url} alt={title}/>
    )
  }
}
