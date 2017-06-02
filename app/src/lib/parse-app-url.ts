import * as URL from 'url'
import { testForInvalidChars } from './sanitize-branch'

interface IURLAction<T> {
  name: string
  readonly args: T
}

export interface IOAuthActionArgs {
  readonly code: string
}

export interface IOpenRepositoryArgs {
  /** the remote repository location associated with the "Open in Desktop" action */
  readonly url: string
  /** the optional branch name which should be checked out. use the default branch otherwise. */
  readonly branch?: string
  /** the pull request number, if pull request originates from a fork of the repository */
  readonly pr?: string
  /** the file to open after cloning the repository */
  readonly filepath?: string
}

export interface IOAuthAction extends IURLAction<IOAuthActionArgs> {
  readonly name: 'oauth'
  readonly args: IOAuthActionArgs
}

export interface IOpenRepositoryAction extends IURLAction<IOpenRepositoryArgs> {
  readonly name: 'open-repository'
  readonly args: IOpenRepositoryArgs
}

export interface IUnknownAction extends IURLAction<{}> {
  readonly name: 'unknown'
  readonly args: {}
}

export type URLActionType = IOAuthAction | IOpenRepositoryAction | IUnknownAction

export function parseAppURL(url: string): URLActionType {
  const parsedURL = URL.parse(url, true)
  const hostname = parsedURL.hostname
  const unknown: IUnknownAction = { name: 'unknown', args: {} }
  if (!hostname) { return unknown }

  const actionName = hostname.toLowerCase()
  if (actionName === 'oauth') {
    return { name: 'oauth', args: { code: parsedURL.query.code } }
  }

  if (actionName === 'openrepo') {

    // we require something resembling a URL first
    // - bail out if it's not defined
    // - bail out if you only have `/`
    const pathName = parsedURL.pathname
    if (!pathName || pathName.length <= 1) { return unknown }

    // trim the leading / from the parsed URL
    const probablyAURL = pathName.substr(1)

    // suffix the remote URL with `.git`, for backwards compatibility
    const url = `${probablyAURL}.git`

    const queryString = parsedURL.query

    const pr = queryString.pr
    const branch = queryString.branch
    const filepath = queryString.filepath

    if (pr) {
      // if anything other than a number is used for the PR value, exit
      if (!/^\d+$/.test(pr)) { return unknown }

      // we also expect the branch for a forked PR to be a given ref format
      if (!/^pr\/\d+$/.test(branch)) { return unknown }
    }

    if (branch) {
      if (testForInvalidChars(branch)) { return unknown }
    }

    return {
      name: 'open-repository',
      args: {
        url,
        branch,
        pr,
        filepath,
      },
    }
  }

  return unknown
}
