import * as React from 'react'
import { IFilterListItem } from '../lib/filter-list'
import { IPullRequest } from '../../models/pull-request'

export interface IPullRequestListItem extends IFilterListItem {
  readonly id: string
  readonly text: string
  readonly pullRequest: IPullRequest
}

interface IPullRequestListItemProps {
  readonly pullRequestItem: IPullRequestListItem
}

export class PullRequestListItem extends React.Component<
  IPullRequestListItemProps,
  {}
> {
  public render() {
    const pullRequest = this.props.pullRequestItem.pullRequest
    return <div>{pullRequest.title}</div>
  }
}
