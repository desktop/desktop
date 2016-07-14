import * as URL from 'url'

interface URLAction<T> {
  name: string
  readonly args: T
}

export interface OAuthActionArgs {
  readonly code: string
}

export interface OAuthAction extends URLAction<OAuthActionArgs> {
  readonly name: 'oauth'
  readonly args: OAuthActionArgs
}

export interface UnknownAction extends URLAction<{}> {
  readonly name: 'unknown'
  readonly args: {}
}

export type URLActionType = OAuthAction | UnknownAction

export default function parseURL(url: string): URLActionType {
  const parsedURL = URL.parse(url, true)
  const actionName = parsedURL.hostname
  if (actionName === 'oauth') {
    return {name: 'oauth', args: {code: parsedURL.query.code}}
  } else {
    return {name: 'unknown', args: {}}
  }
}
