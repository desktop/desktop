import * as React from 'react'
import * as moment from 'moment'
import { Octicon, OcticonSymbol } from '../octicons'
import { APIRefState } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'

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
  readonly status: APIRefState
}

/** Pull requests as rendered in the Pull Requests list. */
export class PullRequestListItem extends React.Component<
  IPullRequestListItemProps,
  {}
> {
  public render() {
    const timeAgo = moment(this.props.created).fromNow()
    const { title, author, status } = this.props
    const subtitle = `#${this.props.number} opened ${timeAgo} by ${author}`
    const ciTitle = `Commit status: ${status}`
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

        <Octicon
          className={`status status-${status}`}
          symbol={getSymbolForStatus(status)}
          title={ciTitle}
        />
      </div>
    )
  }
}

function getSymbolForStatus(status: APIRefState): OcticonSymbol {
  switch (status) {
    case 'pending':
      return OcticonSymbol.primitiveDot
    case 'failure':
      return OcticonSymbol.x
    case 'success':
      return OcticonSymbol.check
  }

  return assertNever(status, `Unknown status: ${status}`)
}
