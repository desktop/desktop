import * as React from 'react'
import { CIStatus } from './ci-status'
import { PullRequestStatus } from '../../models/pull-request'

interface IPullRequestBadgeProps {
  /** The CI status of the pull request. */
  readonly status: PullRequestStatus | null

  /** The pull request's number. */
  readonly number: number
}

/** The pull request info badge. */
export class PullRequestBadge extends React.Component<
  IPullRequestBadgeProps,
  {}
> {
  public render() {
    const status = this.props.status

    if (!status || status.totalCount === 0) {
      return null
    }

    return (
      <div className="pr-badge">
        <span className="number">#{this.props.number}</span>

        <CIStatus status={status} />
      </div>
    )
  }
}
