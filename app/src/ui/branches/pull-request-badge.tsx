import * as React from 'react'
import { CIStatus } from './ci-status'
import { IAPIRefStatus } from '../../lib/api'

interface IPullRequestBadgeProps {
  /** The CI status of the pull request. */
  readonly status: IAPIRefStatus | null

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

    return (
      <div className="pr-badge">
        <span className="number">#{this.props.number}</span>
        {status != null && status.total_count > 0 ? (
          <CIStatus status={status} />
        ) : null}
      </div>
    )
  }
}
