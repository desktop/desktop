import * as React from 'react'
import { IAvatarUser } from '../../models/avatar'
import { Octicon, OcticonSymbolVariant } from '../octicons'
import { API, getDotComAPIEndpoint, getHTMLURL } from '../../lib/api'
import { TooltippedContent } from './tooltipped-content'
import { TooltipDirection } from './tooltip'
import {
  isGHE,
  isGHES,
  supportsAvatarsAPI,
} from '../../lib/endpoint-capabilities'
import { Account } from '../../models/account'
import { parseStealthEmail } from '../../lib/email'
import noop from 'lodash/noop'
import { offsetFrom } from '../../lib/offset-from'
import { ExpiringOperationCache } from './expiring-operation-cache'
import { forceUnwrap } from '../../lib/fatal-error'

const avatarTokenCache = new ExpiringOperationCache<
  { endpoint: string; accounts: ReadonlyArray<Account> },
  string
>(
  ({ endpoint }) => endpoint,
  async ({ endpoint, accounts }) => {
    if (!isGHE(endpoint)) {
      throw new Error('Avatar tokens are only available for ghe.com')
    }

    const account = accounts.find(a => a.endpoint === endpoint)
    if (!account) {
      throw new Error('No account found for endpoint')
    }

    const api = new API(endpoint, account.token)
    const token = await api.getAvatarToken()

    return forceUnwrap('Avatar token missing', token)
  },
  () => offsetFrom(0, 50, 'minutes')
)

const getBotLogin = (user: IAvatarUser) => {
  const { endpoint } = user
  if (user.avatarURL !== undefined || endpoint === null) {
    return undefined
  }

  const match = parseStealthEmail(user.email, endpoint)

  return match?.login?.endsWith('[bot]') ? match.login : undefined
}

const botAvatarCache = new ExpiringOperationCache<
  { user: IAvatarUser; accounts: ReadonlyArray<Account> },
  IAvatarUser
>(
  ({ user }) => `${user.endpoint}:${user.email}`,
  async ({ user, accounts }) => {
    const { endpoint } = user
    if (user.avatarURL !== undefined || endpoint === null) {
      throw new Error('Avatar URL already resolved or endpoint is missing')
    }

    const account = accounts.find(a => a.endpoint === user.endpoint)

    if (!account) {
      throw new Error('No account found for endpoint')
    }

    const login = getBotLogin(user)

    if (!login) {
      throw new Error('Email does not appear to be a bot email')
    }

    const api = new API(endpoint, account.token)
    const apiUser = await api.fetchUser(login)

    if (!apiUser?.avatar_url) {
      throw new Error('No avatar url returned from API')
    }

    return { ...user, avatarURL: apiUser.avatar_url }
  },
  ({ user }) =>
    user.endpoint && isGHE(user.endpoint)
      ? offsetFrom(0, 50, 'minutes')
      : Infinity
)

const dotComBot = (login: string, id: number, integrationId: number) => {
  const avatarURL = `https://avatars.githubusercontent.com/in/${integrationId}?v=4`
  const endpoint = getDotComAPIEndpoint()
  const stealthHost = 'users.noreply.github.com'
  return [
    {
      email: `${id}+${login}@${stealthHost}`,
      name: login,
      avatarURL,
      endpoint,
    },
    { email: `${login}@${stealthHost}`, name: login, avatarURL, endpoint },
  ]
}

const knownAvatars: ReadonlyArray<IAvatarUser> = [
  ...dotComBot('dependabot[bot]', 49699333, 29110),
  ...dotComBot('github-actions[bot]', 41898282, 15368),
  ...dotComBot('github-pages[bot]', 52472962, 34598),
]

// Preload some of the more popular bot avatars so we don't have to hit the API
knownAvatars.forEach(user =>
  botAvatarCache.set({ user, accounts: [] }, user, Infinity)
)

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

  readonly accounts: ReadonlyArray<Account>
}

interface IAvatarState {
  readonly user?: IAvatarUser
  readonly candidates: ReadonlyArray<string>
  readonly imageError: boolean
  readonly avatarToken?: string | Promise<void>
}

/**
 * This is the person octicon from octicons v5 (which we're using at time of writing).
 * The octicon has been tweaked to add some padding and so that it scales nicely in
 * a square aspect ratio.
 */
const DefaultAvatarSymbol: OcticonSymbolVariant = {
  w: 16,
  h: 16,
  p: [
    'M13 13.145a.844.844 0 0 1-.832.855H3.834A.846.846 0 0 1 3 13.142v-.856c0-2.257 3.333-3.429 3.333-3.429s.191-.35 0-.857c-.7-.531-.786-1.363-.833-3.429C5.644 2.503 7.056 2 8 2s2.356.502 2.5 2.571C10.453 6.637 10.367 7.47 9.667 8c-.191.506 0 .857 0 .857S13 10.03 13 12.286v.859z',
  ],
}

function getEmailAvatarUrl(ep: string) {
  if (isGHES(ep)) {
    // GHES Endpoint urls look something like https://github.example.com/api/v3
    // (note the lack of a trailing slash). We really should change our endpoint
    // URLs to always have a trailing slash but that's one heck of an
    // undertaking since we'd have to migrate all the existing endpoints in
    // our IndexedDB databases so for now we'll just assume we'll add a trailing
    // slash in the future and be future proof.
    return new URL(`enterprise/avatars/u/e`, ep.endsWith('/') ? ep : `${ep}/`)
  } else if (isGHE(ep)) {
    // getHTMLURL(ep) is a noop here since it currently only deals with
    // github.com and assumes all others confrom to the GHES url structure but
    // we're likely going to need to update that in the future to support
    // ghe.com specifically so we're calling it here for future proofing.
    return new URL('/avatars/u/e', getHTMLURL(ep))
  } else {
    // It's safe to fall back to GitHub.com, at worst we'll get identicons
    return new URL('https://avatars.githubusercontent.com/u/e')
  }
}

/**
 * Produces an ordered iterable of avatar urls to attempt to load for the
 * given user.
 */
function getAvatarUrlCandidates(
  user: IAvatarUser | undefined,
  avatarToken: string | undefined,
  size = 64
): ReadonlyArray<string> {
  const candidates = new Array<string>()

  if (user === undefined) {
    return candidates
  }

  const { email, avatarURL } = user
  const ep = user.endpoint ?? getDotComAPIEndpoint()

  // By leveraging the avatar url from the API (if we've got it) we can
  // load the avatar from one of the load balanced domains (avatars). We can't
  // do the same for GHES/GHAE however since the URLs returned by the API are
  // behind private mode.
  if (!isGHES(ep) && avatarURL !== undefined) {
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
  }

  if (isGHES(ep) && !supportsAvatarsAPI(ep)) {
    // We're dealing with an old GitHub Enterprise instance so we're unable to
    // get to the avatar by requesting the avatarURL due to the private mode
    // (see https://github.com/desktop/desktop/issues/821).
    return []
  }

  if (isGHE(ep) && !avatarToken) {
    // ghe.com requires a token, nothing we can do here, we'll be called again
    // once the token has been loaded
    return []
  }

  const emailAvatarUrl = getEmailAvatarUrl(ep)

  emailAvatarUrl.searchParams.set('email', email)
  emailAvatarUrl.searchParams.set('s', `${size}`)

  if (isGHE(ep) && avatarToken) {
    emailAvatarUrl.searchParams.set('token', avatarToken)
  }

  candidates.push(`${emailAvatarUrl}`)

  return candidates
}

const getInitialStateForUser = (
  user: IAvatarUser | undefined,
  accounts: ReadonlyArray<Account>,
  size: number | undefined,
  avatarToken?: string
): Pick<IAvatarState, 'user' | 'candidates' | 'avatarToken'> => {
  if (user && !user.avatarURL) {
    user = botAvatarCache.tryGet({ user, accounts }) ?? user
  }
  const endpoint = user?.endpoint
  avatarToken ??=
    endpoint && isGHE(endpoint)
      ? avatarTokenCache.tryGet({ endpoint, accounts })
      : undefined
  const candidates = getAvatarUrlCandidates(user, avatarToken, size)

  return { user, candidates, avatarToken }
}

/** A component for displaying a user avatar. */
export class Avatar extends React.Component<IAvatarProps, IAvatarState> {
  public static getDerivedStateFromProps(
    props: IAvatarProps,
    state: IAvatarState
  ) {
    // Explicitly exclude equality checks on avatarURL or else we'll end up
    // infinitely looping when the user gets resolved into a bot account
    if (
      props.user?.email !== state.user?.email ||
      props.user?.endpoint !== state.user?.endpoint ||
      props.user?.name !== state.user?.name
    ) {
      return getInitialStateForUser(props.user, props.accounts, props.size)
    }

    return null
  }

  /** Set to true when unmounting to avoid unnecessary state updates */
  private cancelAvatarRequests = false

  public constructor(props: IAvatarProps) {
    super(props)

    const { user, size, accounts } = props

    this.state = {
      ...getInitialStateForUser(user, accounts, size),
      imageError: false,
    }
  }

  private getTitle() {
    const { title, accounts } = this.props
    const { user } = this.state

    if (title === null) {
      return undefined
    }

    if (title !== undefined) {
      return title
    }

    if (user?.name) {
      return (
        <>
          <Avatar title={null} user={user} accounts={accounts} />
          <div>
            <div>
              <strong>{user.name}</strong>
            </div>
            <div>{user.email}</div>
          </div>
        </>
      )
    }

    return user?.email ?? 'Unknown user'
  }

  private onImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { src } = e.currentTarget
    const candidates = this.state.candidates.filter(x => x !== src)
    this.setState({ candidates, imageError: candidates.length === 0 })
  }

  private onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (this.state.imageError) {
      this.setState({ imageError: false })
    }
  }

  public render() {
    const title = this.getTitle()
    const { imageError, user } = this.state
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
        {(!src || imageError) && (
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
            style={{ display: imageError ? 'none' : undefined }}
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

  private ensureAvatarToken() {
    // fetch the avatar token for the endpoint if we don't have it
    // when the async fetch completes, check if we're still mounted and if
    // the endpoint still matches
    // also need to keep track of whether we have an async fetch in flight or
    // not so we don't trigger multiple fetches for the same endpoint
    const { accounts } = this.props
    const { user } = this.state
    const endpoint = user?.endpoint

    // We've already got a token or we don't have a user, nothing to do here
    if (this.state.avatarToken || !user || !accounts) {
      return
    }

    if (!endpoint || !isGHE(endpoint)) {
      return
    }

    // Can we get a token synchronously?
    const token = avatarTokenCache.tryGet({ endpoint, accounts })
    if (token) {
      this.resetAvatarCandidates(token)
      return
    }

    this.setState({
      avatarToken: avatarTokenCache
        .get({ endpoint, accounts })
        .then(token => {
          if (!this.cancelAvatarRequests) {
            if (token && this.state.user?.endpoint === endpoint) {
              this.resetAvatarCandidates(token)
            }
          }
        })
        .catch(e => log.debug(`Failed to fetch avatar token: ${e}`)),
    })
  }

  public componentDidUpdate(prevProps: IAvatarProps, prevState: IAvatarState) {
    this.ensureAvatarToken()

    const oldUser = prevState.user
    const newUser = this.state.user

    if (
      oldUser?.endpoint !== newUser?.endpoint ||
      oldUser?.email !== newUser?.email
    ) {
      this.resolveBotAvatar()
    }
  }

  private resetAvatarCandidates(avatarToken?: string) {
    const { user } = this.state
    const { size, accounts } = this.props

    this.setState(getInitialStateForUser(user, accounts, size, avatarToken))
  }

  public componentDidMount() {
    window.addEventListener('online', this.onInternetConnected)
    pruneExpiredFailingAvatars()
    this.ensureAvatarToken()
    this.resolveBotAvatar()
  }

  private resolveBotAvatar() {
    const { accounts } = this.props
    const { user } = this.state

    if (user?.endpoint && !user.avatarURL && getBotLogin(user)) {
      botAvatarCache
        .get({ user, accounts })
        .then(resolved => {
          if (
            !this.cancelAvatarRequests &&
            user.endpoint === resolved.endpoint &&
            user.email === resolved.email &&
            user.name === resolved.name &&
            user.avatarURL !== resolved.avatarURL
          ) {
            this.setState({ user: resolved }, () =>
              this.resetAvatarCandidates()
            )
          }
        })
        .catch(noop)
    }
  }

  public componentWillUnmount() {
    window.removeEventListener('online', this.onInternetConnected)
    this.cancelAvatarRequests = true
  }

  private onInternetConnected = () => {
    // Let's assume us being offline was the reason for failing to
    // load the avatars
    FailingAvatars.clear()

    // If we've been offline and therefore failed to load an avatar
    // we'll automatically retry when the user becomes connected again.
    if (this.state.candidates.length === 0) {
      this.resetAvatarCandidates()
    }
  }
}
