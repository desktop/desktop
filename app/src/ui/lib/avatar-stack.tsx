import * as React from 'react'
import * as classNames from 'classnames'
import { Avatar } from './avatar'
import { IAvatarUser } from '../../models/avatar'

const MAX_DISPLAYED_COMMIT_AVATARS = 3

interface IAvatarStackProps {
  readonly users: ReadonlyArray<IAvatarUser>
}

export class AvatarStack extends React.Component<IAvatarStackProps, {}> {
  public render() {
    const elems = []
    const users = this.props.users

    for (let i = 0; i < this.props.users.length; i++) {
      const user = users[i]

      if (
        users.length > MAX_DISPLAYED_COMMIT_AVATARS &&
        i === MAX_DISPLAYED_COMMIT_AVATARS - 1
      ) {
        elems.push(<div key="more" className="avatar-more avatar" />)
      }

      elems.push(
        <Avatar key={`${i}${user.avatarURL}`} user={user} skipTitle={true} />
      )
    }

    const className = classNames('AvatarStack', {
      'AvatarStack--small': true,
      'AvatarStack--two': users.length === 2,
      'AvatarStack--three-plus': users.length >= MAX_DISPLAYED_COMMIT_AVATARS,
    })

    return (
      <div className={className}>
        <div className="AvatarStack-body">{elems}</div>
      </div>
    )
  }
}
