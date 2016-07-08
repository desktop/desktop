import * as URL from 'url'

interface IURLAction<T> {
  name: string
  args: T
}

export interface IOAuthActionArgs {
  code: string
}

export interface IOAuthAction extends IURLAction<IOAuthActionArgs> {
  name: 'oauth'
  args: IOAuthActionArgs
}

export interface IUnknownAction extends IURLAction<{}> {
  name: 'unknown'
  args: {}
}

export type URLActionType = IOAuthAction | IUnknownAction

export default function parseURL(url: string): URLActionType {
  const parsedURL = URL.parse(url, true)
  const actionName = parsedURL.hostname
  if (actionName === 'oauth') {
    return {name: 'oauth', args: {code: parsedURL.query.code}}
  } else {
    return {name: 'unknown', args: {}}
  }
}

export function isOAuthAction(action: URLActionType): action is IOAuthAction {
  return action.name === 'oauth'
}
