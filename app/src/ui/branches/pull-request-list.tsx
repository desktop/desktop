import * as React from 'react'
import { IPullRequest } from '../../models/pull-request'

interface IPullRequestListProps {
  readonly pullRequests: ReadonlyArray<IPullRequest>
}

export class PullRequestList extends React.Component<
  IPullRequestListProps,
  {}
> {
  public render() {
    console.log(this.props.pullRequests)
    return <div className="pull-request-list" />
  }
}
