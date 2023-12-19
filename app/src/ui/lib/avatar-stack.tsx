import * as React from 'react'
import classNames from 'classnames'
import { Avatar } from './avatar'
import { IAvatarUser } from '../../models/avatar'
import { Account } from '../../models/account'

/**
 * The maximum number of avatars to stack before hiding
 * the rest behind the hover action. Note that changing this
 * means that the css needs to change as well.
 */
const MaxDisplayedAvatars = 3

interface IAvatarStackProps {
  readonly users: ReadonlyArray<IAvatarUser>
  readonly accounts: ReadonlyArray<Account>
}

/**
 * A component which renders one or more avatars into a stacked
 * view which expands on hover, replicated from github.com's
 * avatar stacks.
 */
export class AvatarStack extends React.Component<IAvatarStackProps, {}> {
  public render() {
    const elems = []
    const { users, accounts } = this.props

    for (let i = 0; i < this.props.users.length; i++) {
      if (
        users.length > MaxDisplayedAvatars + 1 &&
        i === MaxDisplayedAvatars - 1
      ) {
        elems.push(<div key="more" className="avatar-more avatar" />)
      }

      elems.push(<Avatar key={`${i}`} user={users[i]} accounts={accounts} />)
    }

    const className = classNames('AvatarStack', {
      'AvatarStack--small': true,
      'AvatarStack--two': users.length === 2,
      'AvatarStack--three': users.length === 3,
      'AvatarStack--plus': users.length > MaxDisplayedAvatars,
    })

    return (
      <div className={className}>
        <div className="AvatarStack-body">{elems}</div>
      </div>
    )
  }
}
