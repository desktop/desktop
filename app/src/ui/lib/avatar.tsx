import * as React from 'react'
import { encodePathAsUrl } from '../../lib/path'
import { IAvatarUser } from '../../models/avatar'
import { shallowEquals } from '../../lib/equality'
import { generateGravatarUrl } from '../../lib/gravatar'

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
  readonly user?: IAvatarUser
  readonly candidates: ReadonlyArray<string>
}

const dotComAvatarEndpoint = `https://avatars.githubusercontent.com`

function* getAvatarUrlCandidates(
  user: IAvatarUser | undefined,
  size = 60
): Iterable<string> {
  if (user === undefined) {
    yield DefaultAvatarURL
    return
  }

  const { email } = user

  const stealthEmailMatch = /(?:(\d+)\+)?(.+?)@users\.noreply\.github\.com/i.exec(
    email
  )

  if (stealthEmailMatch) {
    const [, userId, login] = stealthEmailMatch
    if (userId !== undefined) {
      yield `${dotComAvatarEndpoint}/u/${userId}?s=${size}`
    } else {
      yield `${dotComAvatarEndpoint}/${login}?s=${size}`
    }
  }

  yield `${dotComAvatarEndpoint}/u/e?email=${encodeURIComponent(
    email
  )}&s=${size}`

  // The /u/e endpoint above falls back to gravatar (proxied)
  // so we don't technically have to add gravatar to the fallback
  // but on the off chance that the avatars host is having issues
  // we'll add our own fallback.
  yield generateGravatarUrl(email, size)

  yield DefaultAvatarURL
}

/** A component for displaying a user avatar. */
export class Avatar extends React.Component<IAvatarProps, IAvatarState> {
  public static getDerivedStateFromProps(
    props: IAvatarProps,
    state: IAvatarState
  ): Partial<IAvatarState> | null {
    const { user } = props
    if (!shallowEquals(user, state.user)) {
      const candidates = [...getAvatarUrlCandidates(user)]
      return { user, candidates }
    }
    return null
  }

  public constructor(props: IAvatarProps) {
    super(props)

    this.state = {
      user: props.user,
      candidates: [...getAvatarUrlCandidates(props.user)],
    }
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

  private onImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (this.state.candidates.length === 0) {
      return
    }

    console.warn(`Failed to load avatar from: ${e.currentTarget.src}`)
    this.setState({ candidates: this.state.candidates.slice(1) })
  }

  public render() {
    const title = this.getTitle()
    const ariaLabel = this.props.user
      ? `Avatar for ${this.props.user.name || this.props.user.email}`
      : `Avatar for unknown user`

    const src = this.state.candidates[0] || DefaultAvatarURL

    const img = (
      <img
        className="avatar"
        title={title}
        src={src}
        alt={title}
        aria-label={ariaLabel}
        onError={this.onImageError}
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
