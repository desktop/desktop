import * as URL from 'url'

interface IURLAction<T> {
  name: string
  readonly args: T
}

export interface IOAuthActionArgs {
  readonly code: string
}

export interface IOAuthAction extends IURLAction<IOAuthActionArgs> {
  readonly name: 'oauth'
  readonly args: IOAuthActionArgs
}

export interface IUnknownAction extends IURLAction<{}> {
  readonly name: 'unknown'
  readonly args: {}
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
