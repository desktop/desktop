import * as React from 'react'
import { encodePathAsUrl } from '../../lib/path'
import { IAvatarUser } from '../../models/avatar'
import { fetchAvatarUrl } from './avatar-in-memory-cache'

const DefaultAvatarURL = encodePathAsUrl(__dirname, 'static/default-avatar.png')

interface IAvatarProps {
  /** The user whose avatar should be displayed. */
  readonly user?: IAvatarUser

  /**
   * The title of the avatar.
   * Defaults to the name and email if undefined and is
   * skipped completely if title is null
   */
  readonly title?: string | null
}

interface IAvatarState {
  readonly dataUrl?: string
}

/** A component for displaying a user avatar. */
export class Avatar extends React.Component<IAvatarProps, IAvatarState> {
  private cancelFetchingAvatar = false

  public constructor(props: IAvatarProps) {
    super(props)

    this.state = { dataUrl: DefaultAvatarURL }
  }

  public shouldComponentUpdate(
    nextProps: IAvatarProps,
    nextState: IAvatarState
  ) {
    if (nextState.dataUrl !== this.state.dataUrl) {
      return true
    }

    if (nextProps.user && this.props.user) {
      if (
        nextProps.user.avatarURL !== this.props.user.avatarURL ||
        nextProps.user.email !== this.props.user.email ||
        nextProps.user.name !== this.props.user.name ||
        nextProps.title !== this.props.title
      ) {
        return true
      }
    }

    if (!nextProps.user && !this.props.user) {
      return nextProps.title !== this.props.title
    }

    return false
  }

  public async componentWillMount() {
    const dataUrl = await fetchAvatarUrl(DefaultAvatarURL, this.props.user)

    // https://reactjs.org/blog/2015/12/16/ismounted-antipattern.html
    // We're basically doing isMounted here. Let's look at better ways
    // in the future
    if (!this.cancelFetchingAvatar) {
      this.setState({ dataUrl })
    }
  }

  public async componentWillReceiveProps(nextProps: IAvatarProps) {
    const dataUrl = await fetchAvatarUrl(DefaultAvatarURL, nextProps.user)

    // https://reactjs.org/blog/2015/12/16/ismounted-antipattern.html
    // We're basically doing isMounted here. Let's look at better ways
    // in the future
    if (!this.cancelFetchingAvatar) {
      this.setState({ dataUrl })
    }
  }

  public componentWillUnmount() {
    this.cancelFetchingAvatar = true
  }

  private getTitle(): string | undefined {
    if (this.props.title === null) {
      return undefined
    }

    if (this.props.title === undefined) {
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
    const title = this.getTitle()
    const ariaLabel = this.props.user
      ? `Avatar for ${this.props.user.name || this.props.user.email}`
      : `Avatar for unknown user`

    const img = (
      <img
        className="avatar"
        title={title}
        src={this.state.dataUrl}
        alt={title}
        aria-label={ariaLabel}
      />
    )

    if (title === undefined) {
      return img
    }

    return (
      <span title={title} className="avatar-container">
        {img}
      </span>
    )
  }
}
