import type {
  APIRefState,
  IAPIEmail,
  IAPIPullRequest,
  IAPIRefStatus,
  IAPIRefStatusItem,
} from './api'

/**
 * The path, relative to the root of a Gitea (or Forgejo) server, under which
 * the REST API is served.
 */
const giteaAPIPath = '/api/v1'

const trimTrailingSlashes = (s: string) => s.replace(/\/+$/, '')

/**
 * Whether or not the given API endpoint belongs to a Gitea server.
 *
 * GitHub.com and GitHub Enterprise never serve their API from `/api/v1` so
 * that's what we use to tell Gitea accounts apart from GitHub accounts.
 */
export function isGiteaEndpoint(endpoint: string): boolean {
  try {
    const { pathname } = new URL(endpoint)
    return trimTrailingSlashes(pathname).endsWith(giteaAPIPath)
  } catch {
    return false
  }
}

/**
 * Get the API endpoint for a Gitea server from a user-provided server address.
 *
 * Accepts addresses with or without a protocol (defaulting to https), with or
 * without a trailing slash, with a custom port or sub path and even the API
 * url itself. Returns null if the address can't be parsed.
 *
 * Examples:
 *
 * gitea.example.com            -> https://gitea.example.com/api/v1
 * http://localhost:3000/       -> http://localhost:3000/api/v1
 * https://example.com/git      -> https://example.com/git/api/v1
 * https://example.com/api/v1/  -> https://example.com/api/v1
 */
export function getGiteaAPIEndpoint(address: string): string | null {
  const trimmed = address.trim()
  if (trimmed.length === 0) {
    return null
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }

  let path = trimTrailingSlashes(url.pathname)
  if (path.endsWith(giteaAPIPath)) {
    path = path.substring(0, path.length - giteaAPIPath.length)
  }

  return `${url.origin}${path}${giteaAPIPath}`
}

/**
 * Get the URL of the web interface of a Gitea server given its API endpoint.
 * Unlike `getHTMLURL` for GitHub Enterprise this retains the port and any sub
 * path the server is hosted under.
 *
 * https://gitea.example.com:3000/git/api/v1 -> https://gitea.example.com:3000/git
 */
export function getGiteaHTMLURL(endpoint: string): string {
  const url = new URL(endpoint)
  let path = trimTrailingSlashes(url.pathname)
  if (path.endsWith(giteaAPIPath)) {
    path = path.substring(0, path.length - giteaAPIPath.length)
  }
  return `${url.origin}${path}`
}

/**
 * Whether the host portion of a parsed remote (see `parseRemote`) points to
 * the Gitea server with the given API endpoint.
 *
 * HTTPS remotes include the port and any sub path in the host portion
 * (`gitea.example.com:3000/git`) whereas SSH remotes typically only contain
 * the hostname (`gitea.example.com`) or hostname and SSH port.
 */
export function giteaEndpointMatchesRemoteHost(
  endpoint: string,
  remoteHost: string
): boolean {
  const url = new URL(getGiteaHTMLURL(endpoint))
  const path = trimTrailingSlashes(url.pathname).toLowerCase()
  const host = url.host.toLowerCase()
  const hostname = url.hostname.toLowerCase()

  const candidates = new Set([`${host}${path}`, `${hostname}${path}`, hostname])
  const remote = trimTrailingSlashes(remoteHost.toLowerCase())
  const remoteWithoutPort = remote.replace(/:\d+(?=\/|$)/, '')

  return candidates.has(remote) || candidates.has(remoteWithoutPort)
}

/**
 * Get the web URL for a pull request.
 *
 * GitHub serves pull requests at `/pull/:number` whereas Gitea serves them at
 * `/pulls/:number`.
 */
export function getPullRequestURL(
  repositoryHtmlURL: string,
  endpoint: string,
  pullRequestNumber: number
): string {
  const segment = isGiteaEndpoint(endpoint) ? 'pulls' : 'pull'
  return `${repositoryHtmlURL}/${segment}/${pullRequestNumber}`
}

/** Encode a branch name for use in a URL path while preserving slashes. */
const encodeBranchName = (branch: string) =>
  branch.split('/').map(encodeURIComponent).join('/')

/**
 * Get the URL of the Gitea page for creating a new pull request.
 *
 * @param baseRepositoryHtmlURL The web URL of the repository the pull request
 *                              targets (the parent repository for forks).
 * @param headBranch            The branch containing the changes.
 * @param baseBranch            The branch to merge into, omit to let Gitea use
 *                              the repository's default branch.
 * @param headOwner             The owner of the fork the changes live in, if
 *                              contributing to a parent repository.
 */
export function getGiteaCompareURL(
  baseRepositoryHtmlURL: string,
  headBranch: string,
  baseBranch?: string,
  headOwner?: string
): string {
  const head =
    (headOwner !== undefined ? `${encodeURIComponent(headOwner)}:` : '') +
    encodeBranchName(headBranch)

  const range =
    baseBranch !== undefined
      ? `${encodeBranchName(baseBranch)}...${head}`
      : head

  return `${baseRepositoryHtmlURL}/compare/${range}`
}

/**
 * Gitea marks pull requests as work in progress (drafts) by prefixing their
 * title. These are the default prefixes (`[repository.pull-request]
 * WORK_IN_PROGRESS_PREFIXES`).
 */
const workInProgressPrefixes = ['wip:', '[wip]']

/**
 * Normalize a pull request returned by the Gitea API to the shape Desktop
 * expects from the GitHub API.
 *
 * Older Gitea versions don't report the `draft` flag so we fall back to
 * checking for the work in progress title prefix.
 */
export function normalizeGiteaPullRequest(
  pr: IAPIPullRequest
): IAPIPullRequest {
  const title = pr.title.toLowerCase()
  const draft =
    pr.draft ?? workInProgressPrefixes.some(prefix => title.startsWith(prefix))

  return { ...pr, body: pr.body ?? '', draft }
}

/** The raw state of a commit status as reported by Gitea. */
type GiteaCommitStatusState =
  | 'pending'
  | 'success'
  | 'error'
  | 'failure'
  | 'warning'
  | 'skipped'

/** A commit status as returned by the Gitea API. */
interface IGiteaCommitStatus {
  readonly id: number
  // Gitea reports the state of individual statuses in `status` rather than
  // `state` like GitHub does.
  readonly status: GiteaCommitStatusState
  readonly target_url: string | null
  readonly description: string
  readonly context: string
}

/** A combined commit status as returned by the Gitea API. */
export interface IGiteaCombinedStatus {
  readonly state: GiteaCommitStatusState | ''
  readonly total_count: number
  readonly statuses: ReadonlyArray<IGiteaCommitStatus> | null
}

function toAPIRefState(state: GiteaCommitStatusState | ''): APIRefState {
  switch (state) {
    case 'success':
    case 'skipped':
      return 'success'
    case 'error':
      return 'error'
    case 'failure':
    case 'warning':
      return 'failure'
    default:
      return 'pending'
  }
}

/**
 * Convert a Gitea combined commit status into the GitHub combined status
 * shape used throughout Desktop.
 */
export function normalizeGiteaCombinedStatus(
  status: IGiteaCombinedStatus
): IAPIRefStatus {
  const statuses = (status.statuses ?? []).map(
    (s): IAPIRefStatusItem => ({
      id: s.id,
      state: toAPIRefState(s.status),
      target_url: s.target_url,
      description: s.description,
      context: s.context,
    })
  )

  return {
    state: toAPIRefState(status.state),
    total_count: statuses.length,
    statuses,
  }
}

/** An email address as returned by the Gitea API. */
export interface IGiteaEmail {
  readonly email: string
  readonly verified: boolean
  readonly primary: boolean
}

/** Convert Gitea email addresses to the GitHub email shape. */
export function normalizeGiteaEmails(
  emails: ReadonlyArray<IGiteaEmail>
): ReadonlyArray<IAPIEmail> {
  return emails.map(({ email, verified, primary }) => ({
    email,
    verified,
    primary,
    visibility: null,
  }))
}
