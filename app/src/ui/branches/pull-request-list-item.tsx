import * as React from 'react'
import * as moment from 'moment'
import { Octicon, OcticonSymbol } from '../octicons'
import { CIStatus } from './ci-status'
import { PullRequestStatus } from '../../models/pull-request'

interface IPullRequestListItemProps {
  /** The title. */
  readonly title: string

  /** The number as received from the API. */
  readonly number: number

  /** The date on which the PR was opened. */
  readonly created: Date

  /** The author login. */
  readonly author: string

  /** The CI status. */
  readonly status: PullRequestStatus | null
}

/** Pull requests as rendered in the Pull Requests list. */
export class PullRequestListItem extends React.Component<
  IPullRequestListItemProps,
  {}
> {
  public render() {
    const timeAgo = moment(this.props.created).fromNow()
    const { title, author } = this.props
    const subtitle = `#${this.props.number} opened ${timeAgo} by ${author}`
    return (
      <div className="pull-request-item">
        <Octicon className="icon" symbol={OcticonSymbol.gitPullRequest} />
        <div className="info">
          <div className="title" title={title}>
            {title}
          </div>
          <div className="subtitle" title={subtitle}>
            {subtitle}
          </div>
        </div>
        {this.renderPullRequestStatus()}
      </div>
    )
  }

  private renderPullRequestStatus() {
    const status = this.props.status

    if (!status || status.totalCount === 0) {
      return null
    }

    return <CIStatus status={status} />
  }
}
