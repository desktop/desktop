import * as URL from 'url'

export interface OAuthAction {
  code: string
}

export type URLAction = {type: 'oauth'} & OAuthAction | {type: 'unknown'}

export default function parseURL(url: string): URLAction {
  const parsedURL = URL.parse(url, true)
  const actionName = parsedURL.hostname
  if (actionName === 'oauth') {
    return {type: 'oauth', code: parsedURL.query.code}
  } else {
    return {type: 'unknown'}
  }
}
