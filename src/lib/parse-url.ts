import * as URL from 'url'

interface URLAction<T> {
  name: string
  args: T
}

export interface OAuthActionArgs {
  code: string
}

export interface OAuthAction extends URLAction<OAuthActionArgs> {
  name: 'oauth'
  args: OAuthActionArgs
}

export interface UnknownAction extends URLAction<{}> {
  name: 'unknown'
  args: {}
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
