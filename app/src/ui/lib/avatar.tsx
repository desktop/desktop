import * as React from 'react'
import { IAvatarUser } from '../../models/avatar'
import { API } from '../../lib/api'
import { Account } from '../../models/account'

const DefaultAvatarURL = 'https://github.com/hubot.png'


interface IAvatarProps {
  /** The user whose avatar should be displayed. */
  readonly user?: IAvatarUser

  /** The title of the avatar. Defaults to the name and email. */
  readonly title?: string

  /** The account to use to authenticate image requests. */
  readonly account: Account
}

interface IAvatarState {
  readonly objectURL: string | null
}

/** A component for displaying a user avatar. */
export class Avatar extends React.Component<IAvatarProps, IAvatarState> {
  private imageRef: HTMLImageElement | null = null

  public constructor(props: IAvatarProps) {
    super(props)

    this.state = { objectURL: null }

    this.receiveProps(props)
  }

  public componentWillReceiveProps(nextProps: IAvatarProps) {
    if (getURL(nextProps) === getURL(this.props)) {
      return
    }

    this.receiveProps(nextProps)
  }

  public componentWillUnmount() {
    this.revokeObjectURL()
  }

  private revokeObjectURL() {
    const objectURL = this.state.objectURL
    if (objectURL) {
      // URL.revokeObjectURL(objectURL)
    }
  }

  private async receiveProps(props: IAvatarProps) {
    const api = new API(props.account)
    const blob = await api.fetchImage(getURL(props))

    this.revokeObjectURL()

    if (blob) {
      const objectURL = URL.createObjectURL(blob)
      this.setState({ objectURL })
    } else {
      this.setState({ objectURL: null })
    }
  }

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

  private onImageRef = (ref: HTMLImageElement | null) => {
    this.imageRef = ref
  }

  public render() {
    const title = this.getTitle()
    return (
      <span title={title} className='avatar-container'>
        <img className='avatar' title={title} src={this.state.objectURL || DefaultAvatarURL} alt={title} ref={this.onImageRef}/>
      </span>
    )
  }
}

function getURL(props: IAvatarProps): string {
  return props.user ? props.user.avatarURL : DefaultAvatarURL
}
