import * as React from 'react'
import { IGitHubUser } from '../../lib/dispatcher'

interface IAvatarProps {
  readonly gitHubUser: IGitHubUser | null
}

export class Avatar extends React.Component<IAvatarProps, void> {
  public render() {
    const DefaultAvatarURL = 'https://github.com/hubot.png'
    const gitHubUser = this.props.gitHubUser
    const avatarURL = (gitHubUser ? gitHubUser.avatarURL : null) || DefaultAvatarURL

    return (
      <img className='avatar' src={avatarURL}/>
    )
  }
}