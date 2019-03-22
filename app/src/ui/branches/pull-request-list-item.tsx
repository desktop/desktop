import * as React from 'react'
import * as moment from 'moment'
import * as classNames from 'classnames'
import { Octicon, OcticonSymbol } from '../octicons'
import { CIStatus } from './ci-status'
import { HighlightText } from '../lib/highlight-text'
import { IMatches } from '../../lib/fuzzy-find'
import { IAPIRefStatus } from '../../lib/api'

export interface IPullRequestListItemProps {
  /** The title. */
  readonly title: string

  /** The number as received from the API. */
  readonly number: number

  /** The date on which the PR was opened. */
  readonly created: Date

  /** The author login. */
  readonly author: string

  /** The CI status. */
  readonly status: IAPIRefStatus | null

  /**
   * Whether or not this list item is a skeleton item
   * put in place while the pull request information is
   * being loaded. This adds a special 'loading' class
   * to the container and prevents any text from rendering
   * inside the list item.
   */
  readonly loading?: boolean

  /** The characters in the PR title to highlight */
  readonly matches: IMatches
}

/** Pull requests as rendered in the Pull Requests list. */
export class PullRequestListItem extends React.Component<
  IPullRequestListItemProps
> {
  private getSubtitle() {
    if (this.props.loading === true) {
      return undefined
    }

    const timeAgo = moment(this.props.created).fromNow()
    return `#${this.props.number} opened ${timeAgo} by ${this.props.author}`
  }

  public render() {
    const title = this.props.loading === true ? undefined : this.props.title
    const subtitle = this.getSubtitle()
    const matches = this.props.matches
    const className = classNames('pull-request-item', {
      loading: this.props.loading === true,
    })

    return (
      <div className={className}>
        <Octicon className="icon" symbol={OcticonSymbol.gitPullRequest} />
        <div className="info">
          <div className="title" title={title}>
            <HighlightText text={title || ''} highlight={matches.title} />
          </div>
          <div className="subtitle" title={subtitle}>
            <HighlightText text={subtitle || ''} highlight={matches.subtitle} />
          </div>
        </div>
        {this.renderPullRequestStatus()}
      </div>
    )
  }

  private renderPullRequestStatus() {
    const status = this.props.status

    if (!status || status.total_count === 0) {
      return null
    }

    return <CIStatus status={status} />
  }
}
