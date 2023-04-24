import * as React from 'react'
import { IAvatarUser } from '../../models/avatar'
import { shallowEquals } from '../../lib/equality'
import { generateGravatarUrl } from '../../lib/gravatar'
import { Octicon } from '../octicons'
import { getDotComAPIEndpoint } from '../../lib/api'
import { TooltippedContent } from './tooltipped-content'
import { TooltipDirection } from './tooltip'
import { supportsAvatarsAPI } from '../../lib/endpoint-capabilities'

/**
 * This maps contains avatar URLs that have failed to load and
 * the last time they failed to load (in milliseconds since the epoc)
 *
 * This is used to prevent us from retrying to load avatars where the
 * server returned an error (or was unreachable). Since browsers doesn't
 * cache the error itself and since we re-mount our image tags when
 * scrolling through our virtualized lists we can end up making a lot
 * of redundant requests to the server when it's busy or down. So
 * when an avatar fails to load we'll remember that and not attempt
 * to load it again for a while (see RetryLimit)
 */
const FailingAvatars = new Map<string, number>()

/**
 * Don't attempt to load an avatar that failed to load more than
 * once every 5 minutes
 */
const RetryLimit = 5 * 60 * 1000

function pruneExpiredFailingAvatars() {
  const expired = new Array<string>()

  for (const [url, lastError] of FailingAvatars.entries()) {
    if (Date.now() - lastError > RetryLimit) {
      expired.push(url)
    } else {
      // Map is sorted by insertion order so we can bail out early assuming
      // we can trust the clock (which I know we can't but it's good enough)
      break
    }
  }

  expired.forEach(url => FailingAvatars.delete(url))
}

interface IAvatarProps {
  /** The user whose avatar should be displayed. */
  readonly user?: IAvatarUser

  /**
   * The title of the avatar.
   * Defaults to the name and email if undefined and is
   * skipped completely if title is null
   */
  readonly title?: string | JSX.Element | null

  /**
   * The what dimensions of avatar the component should
   * attempt to request, defaults to 64px.
   */
  readonly size?: number
}

interface IAvatarState {
  readonly user?: IAvatarUser
  readonly candidates: ReadonlyArray<string>
  readonly imageLoaded: boolean
}

/**
 * This is the person octicon from octicons v5 (which we're using at time of writing).
 * The octicon has been tweaked to add some padding and so that it scales nicely in
 * a square aspect ratio.
 */
const DefaultAvatarSymbol = {
  w: 16,
  h: 16,
  d: 'M13 13.145a.844.844 0 0 1-.832.855H3.834A.846.846 0 0 1 3 13.142v-.856c0-2.257 3.333-3.429 3.333-3.429s.191-.35 0-.857c-.7-.531-.786-1.363-.833-3.429C5.644 2.503 7.056 2 8 2s2.356.502 2.5 2.571C10.453 6.637 10.367 7.47 9.667 8c-.191.506 0 .857 0 .857S13 10.03 13 12.286v.859z',
}

/**
 * A regular expression meant to match both the legacy format GitHub.com
 * stealth email address and the modern format (login@ vs id+login@).
 *
 * Yields two capture groups, the first being an optional capture of the
 * user id and the second being the mandatory login.
 */
const StealthEmailRegexp = /^(?:(\d+)\+)?(.+?)@users\.noreply\.(.*)$/i

/**
 * Produces an ordered iterable of avatar urls to attempt to load for the
 * given user.
 */
function getAvatarUrlCandidates(
  user: IAvatarUser | undefined,
  size = 64
): ReadonlyArray<string> {
  const candidates = new Array<string>()

  if (user === undefined) {
    return candidates
  }

  const { email, endpoint, avatarURL } = user
  const isDotCom = endpoint === getDotComAPIEndpoint()

  // By leveraging the avatar url from the API (if we've got it) we can
  // load the avatar from one of the load balanced domains (avatars). We can't
  // do the same for GHES/GHAE however since the URLs returned by the API are
  // behind private mode.
  if (isDotCom && avatarURL !== undefined) {
    // The avatar urls returned by the API doesn't come with a size parameter,
    // they default to the biggest size we need on GitHub.com which is usually
    // much bigger than what desktop needs so we'll set a size explicitly.
    try {
      const url = new URL(avatarURL)
      url.searchParams.set('s', `${size}`)

      candidates.push(url.toString())
    } catch (e) {
      // This should never happen since URL#constructor only throws for invalid
      // URLs which we can expect the API to not give us
      candidates.push(avatarURL)
    }
  } else if (endpoint !== null && !isDotCom && !supportsAvatarsAPI(endpoint)) {
    // We're dealing with an old GitHub Enterprise instance so we're unable to
    // get to the avatar by requesting the avatarURL due to the private mode
    // (see https://github.com/desktop/desktop/issues/821). So we have no choice
    // but to fall back to gravatar for now.
    candidates.push(generateGravatarUrl(email, size))
    return candidates
  }

  // Are we dealing with a GitHub.com stealth/anonymous email address in
  // either legacy format:
  //  niik@users.noreply.github.com
  //
  // or the current format
  //  634063+niik@users.noreply.github.com
  //
  // If so we unfortunately can't rely on the GitHub avatar endpoint to
  // deliver a match based solely on that email address but luckily for us
  // the avatar service supports looking up a user based either on user id
  // of login, user id being the better option as it's not affected by
  // account renames.
  const stealthEmailMatch = StealthEmailRegexp.exec(email)

  const avatarEndpoint =
    endpoint === null || isDotCom
      ? 'https://avatars.githubusercontent.com'
      : `${endpoint}/enterprise/avatars`

  if (stealthEmailMatch) {
    const [, userId, login, hostname] = stealthEmailMatch

    if (
      hostname === 'github.com' ||
      (endpoint !== null && hostname === new URL(endpoint).hostname)
    ) {
      if (userId !== undefined) {
        const userIdParam = encodeURIComponent(userId)
        candidates.push(`${avatarEndpoint}/u/${userIdParam}?s=${size}`)
      } else {
        const loginParam = encodeURIComponent(login)
        candidates.push(`${avatarEndpoint}/${loginParam}?s=${size}`)
      }
    }
  }

  // The /u/e endpoint above falls back to gravatar (proxied)
  // so we don't have to add gravatar to the fallback.
  const emailParam = encodeURIComponent(email)
  candidates.push(`${avatarEndpoint}/u/e?email=${emailParam}&s=${size}`)

  return candidates
}

/** A component for displaying a user avatar. */
export class Avatar extends React.Component<IAvatarProps, IAvatarState> {
  public static getDerivedStateFromProps(
    props: IAvatarProps,
    state: IAvatarState
  ): Partial<IAvatarState> | null {
    const { user, size } = props
    if (!shallowEquals(user, state.user)) {
      const candidates = getAvatarUrlCandidates(user, size)
      return { user, candidates, imageLoaded: false }
    }
    return null
  }

  public constructor(props: IAvatarProps) {
    super(props)

    const { user, size } = props
    this.state = {
      user,
      candidates: getAvatarUrlCandidates(user, size),
      imageLoaded: false,
    }
  }

  private getTitle(): string | JSX.Element | undefined {
    if (this.props.title === null) {
      return undefined
    }

    if (this.props.title !== undefined) {
      return this.props.title
    }

    const user = this.props.user
    if (user) {
      if (user.name) {
        return (
          <>
            <Avatar title={null} user={user} />
            <div>
              <div>
                <strong>{user.name}</strong>
              </div>
              <div>{user.email}</div>
            </div>
          </>
        )
      } else {
        return user.email
      }
    }

    return 'Unknown user'
  }

  private onImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { candidates } = this.state
    if (candidates.length > 0) {
      this.setState({
        candidates: candidates.filter(x => x !== e.currentTarget.src),
        imageLoaded: false,
      })
    }
  }

  private onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    this.setState({ imageLoaded: true })
  }

  public render() {
    const title = this.getTitle()
    const { user } = this.props
    const { imageLoaded } = this.state
    const alt = user
      ? `Avatar for ${user.name || user.email}`
      : `Avatar for unknown user`

    const now = Date.now()
    const src = this.state.candidates.find(c => {
      const lastFailed = FailingAvatars.get(c)
      return lastFailed === undefined || now - lastFailed > RetryLimit
    })

    return (
      <TooltippedContent
        className="avatar-container"
        tooltipClassName={this.props.title ? undefined : 'user-info'}
        tooltip={title}
        direction={TooltipDirection.NORTH}
        tagName="div"
      >
        {!imageLoaded && (
          <Octicon symbol={DefaultAvatarSymbol} className="avatar" />
        )}
        {src && (
          <img
            className="avatar"
            // This is critical for the functionality of onImageRef, we need a
            // new Image element for each unique url.
            key={src}
            ref={this.onImageRef}
            src={src}
            alt={alt}
            onLoad={this.onImageLoad}
            onError={this.onImageError}
            style={{ display: imageLoaded ? undefined : 'none' }}
          />
        )}
      </TooltippedContent>
    )
  }

  private onImageRef = (img: HTMLImageElement | null) => {
    // This is different from the onImageLoad react event handler because we're
    // never unsubscribing from this. If we were to use the react event handler
    // we'd miss errors that happen after the Avatar component (or img
    // component) has unmounted. We use a `key` on the img element to ensure
    // we're always using a new img element for each unique url.
    img?.addEventListener('error', () => {
      // Keep the map sorted on last failure, see pruneExpiredFailingAvatars
      FailingAvatars.delete(img.src)
      FailingAvatars.set(img.src, Date.now())
    })
  }

  public componentDidMount() {
    window.addEventListener('online', this.onInternetConnected)
    pruneExpiredFailingAvatars()
  }

  public componentWillUnmount() {
    window.removeEventListener('online', this.onInternetConnected)
  }

  private onInternetConnected = () => {
    // Let's assume us being offline was the reason for failing to
    // load the avatars
    FailingAvatars.clear()

    // If we've been offline and therefore failed to load an avatar
    // we'll automatically retry when the user becomes connected again.
    if (this.state.candidates.length === 0) {
      const { user, size } = this.props
      const candidates = getAvatarUrlCandidates(user, size)

      if (candidates.length > 0) {
        this.setState({ candidates })
      }
    }
  }
}
