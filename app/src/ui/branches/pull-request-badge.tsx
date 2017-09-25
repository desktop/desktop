import * as React from 'react'
import { CIStatus } from './ci-status'
import { APIRefState } from '../../lib/api'

interface IPullRequestBadgeProps {
  /** The CI status of the pull request. */
  readonly status: APIRefState

  /** The pull request's number. */
  readonly number: number
}

/** The pull request info badge. */
export class PullRequestBadge extends React.Component<
  IPullRequestBadgeProps,
  {}
> {
  public render() {
    return (
      <div className="pr-badge">
        <span className="number">#{this.props.number}</span>

        <CIStatus status={this.props.status} />
      </div>
    )
  }
}
