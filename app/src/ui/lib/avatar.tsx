import * as React from 'react'
import { IAvatarUser } from '../../models/avatar'
import { shallowEquals } from '../../lib/equality'
import { generateGravatarUrl } from '../../lib/gravatar'
import { OcticonSymbol, Octicon } from '../octicons'
import { getDotComAPIEndpoint } from '../../lib/api'

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

const avatarEndpoint = 'https://avatars.githubusercontent.com'

/**
 * This is the person octicon from octicons v5 (which we're using at time of writing).
 * The octicon has been tweaked to add some padding and so that it scales nicely in
 * a square aspect ratio.
 */
const DefaultAvatarSymbol = new OcticonSymbol(
  16,
  16,
  'M13 13.145a.844.844 0 0 1-.832.855H3.834A.846.846 0 0 1 3 13.142v-.856c0-2.257 3.333-3.429 3.333-3.429s.191-.35 0-.857c-.7-.531-.786-1.363-.833-3.429C5.644 2.503 7.056 2 8 2s2.356.502 2.5 2.571C10.453 6.637 10.367 7.47 9.667 8c-.191.506 0 .857 0 .857S13 10.03 13 12.286v.859z'
)

function* getAvatarUrlCandidates(
  user: IAvatarUser | undefined,
  size = 60
): Iterable<string> {
  if (user === undefined) {
    return
  }

  const { email } = user

  // Are we dealing with a repository hosted on GitHub Enterprise Server?
  // if so we're unable to get to the avatar by requesting the avatarURL
  // due to the private mode (see https://github.com/desktop/desktop/issues/821).
  // So we have no choice but to fall back to gravatar for now.
  if (user.endpoint !== null && user.endpoint !== getDotComAPIEndpoint()) {
    yield generateGravatarUrl(email, size)
    return
  }

  const stealthEmailMatch = /(?:(\d+)\+)?(.+?)@users\.noreply\.github\.com/i.exec(
    email
  )

  if (stealthEmailMatch) {
    const [, userId, login] = stealthEmailMatch
    if (userId !== undefined) {
      yield `${avatarEndpoint}/u/${encodeURIComponent(userId)}?s=${size}`
    } else {
      yield `${avatarEndpoint}/${encodeURIComponent(login)}?s=${size}`
    }
  }

  // The /u/e endpoint above falls back to gravatar (proxied)
  // so we don't have to add gravatar to the fallback.
  yield `${avatarEndpoint}/u/e?email=${encodeURIComponent(email)}&s=${size}`
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

    if (this.state.candidates.length === 0) {
      return (
        <Octicon
          symbol={DefaultAvatarSymbol}
          className="avatar"
          title={title}
        />
      )
    }

    const src = this.state.candidates[0]

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
