import * as URL from 'url'
import { testForInvalidChars } from './sanitize-branch'

export interface IOAuthAction {
  readonly name: 'oauth'
  readonly code: string
}

export interface IOpenRepositoryFromURLAction {
  readonly name: 'open-repository-from-url'

  /** the remote repository location associated with the "Open in Desktop" action */
  readonly url: string

  /** the optional branch name which should be checked out. use the default branch otherwise. */
  readonly branch?: string

  /** the pull request number, if pull request originates from a fork of the repository */
  readonly pr?: string

  /** the file to open after cloning the repository */
  readonly filepath?: string
}

export interface IOpenRepositoryFromPathAction {
  readonly name: 'open-repository-from-path'

  /** The local path to open. */
  readonly path: string
}

export interface IUnknownAction {
  readonly name: 'unknown'
}

export type URLActionType =
  | IOAuthAction
  | IOpenRepositoryFromURLAction
  | IOpenRepositoryFromPathAction
  | IUnknownAction

export function parseAppURL(url: string): URLActionType {
  const parsedURL = URL.parse(url, true)
  const hostname = parsedURL.hostname
  const unknown: IUnknownAction = { name: 'unknown' }
  if (!hostname) {
    return unknown
  }

  const actionName = hostname.toLowerCase()
  if (actionName === 'oauth') {
    return { name: 'oauth', code: parsedURL.query.code }
  }

  // we require something resembling a URL first
  // - bail out if it's not defined
  // - bail out if you only have `/`
  const pathName = parsedURL.pathname
  if (!pathName || pathName.length <= 1) {
    return unknown
  }

  // Trim the trailing / from the URL
  const parsedPath = pathName.substr(1)

  if (actionName === 'openrepo') {
    const probablyAURL = parsedPath

    // suffix the remote URL with `.git`, for backwards compatibility
    const url = `${probablyAURL}.git`

    const queryString = parsedURL.query

    const pr = queryString.pr
    const branch = queryString.branch
    const filepath = queryString.filepath

    if (pr) {
      // if anything other than a number is used for the PR value, exit
      if (!/^\d+$/.test(pr)) {
        return unknown
      }

      // we also expect the branch for a forked PR to be a given ref format
      if (!/^pr\/\d+$/.test(branch)) {
        return unknown
      }
    }

    if (branch) {
      if (testForInvalidChars(branch)) {
        return unknown
      }
    }

    return {
      name: 'open-repository-from-url',
      url,
      branch,
      pr,
      filepath,
    }
  }

  if (actionName === 'openlocalrepo') {
    return {
      name: 'open-repository-from-path',
      path: decodeURIComponent(parsedPath),
    }
  }

  return unknown
}
