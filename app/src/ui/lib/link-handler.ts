
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
