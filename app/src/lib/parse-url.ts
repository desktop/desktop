import * as URL from 'url'

interface IURLAction<T> {
  name: string
  readonly args: T
}

export interface IOAuthActionArgs {
  readonly code: string
}

export interface IOpenRepositoryArgs {
  // the remote repository location associated with the "Open in Desktop" action
  readonly url: string
  // the optional branch name which should be checked out. use the default branch otherwise.
  readonly branch?: string
  // the pull request number, if pull request originates from a fork of the repository
  readonly pr?: string
  // the file to open after cloning the repository
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

export function parseURL(url: string): URLActionType {
  const parsedURL = URL.parse(url, true)
  const hostname = parsedURL.hostname
  const unknown: IUnknownAction = { name: 'unknown', args: {} }
  if (!hostname) { return unknown }

  const actionName = hostname.toLowerCase()
  if (actionName === 'oauth') {
    return { name: 'oauth', args: { code: parsedURL.query.code } }
  }

  if (actionName === 'openrepo') {
    // The `path` will be: /https://github.com/user/repo, so we need to take a
    // substring from the first character on.
    const queryString = parsedURL.query

    return {
      name: 'open-repository',
      args: {
        url: `${parsedURL.path!.substr(1)}.git`,
        branch: queryString.branch,
        pr: queryString.pr,
        filepath: queryString.filepath,
      },
    }
  }

  return unknown
}
