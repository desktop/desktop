import { GitHubRepository } from '../../models/github-repository'
import { assertNever } from '../../lib/fatal-error'
import { getHTMLURL } from '../../lib/api'
import { shell } from '../../lib/dispatcher/app-shell'

export enum LinkType {
  User,
  Issue
}

export interface IUserClick {
  readonly kind: LinkType.User
  readonly user: string
}

export interface IIssueClick {
  readonly kind: LinkType.Issue
  readonly id: number
}

export type ILinkClicked = IUserClick | IIssueClick

export type LinkEventHandler = (event: ILinkClicked) => void

export function launchInBrowser(event: ILinkClicked, repository: GitHubRepository) {
  if (event.kind === LinkType.User) {
    const host = getHTMLURL(repository.endpoint)
    const url = `${host}/${event.user}`
    shell.openExternal(url, { activate: true })
  } else if (event.kind === LinkType.Issue) {
    const url = `${repository.htmlURL}/issues/${event.id}`
    shell.openExternal(url, { activate: true })
  } else {
    assertNever(event, `Unknown event: ${event}`)
  }
}
