import * as React from 'react'
import classNames from 'classnames'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { CIStatus } from './ci-status'
import { HighlightText } from '../lib/highlight-text'
import { IMatches } from '../../lib/fuzzy-find'
import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../dispatcher'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { DropTargetType } from '../../models/drag-drop'
import { getPullRequestCommitRef } from '../../models/pull-request'
import { formatRelative } from '../../lib/format-relative'
import { TooltippedContent } from '../lib/tooltipped-content'

export interface IPullRequestListItemProps {
  /** The title. */
  readonly title: string

  /** The number as received from the API. */
  readonly number: number

  /** The date on which the PR was opened. */
  readonly created: Date

  /** The author login. */
  readonly author: string

  /** Whether or not the PR is in draft mode. */
  readonly draft: boolean

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

  readonly dispatcher: Dispatcher

  /** The GitHub repository to use when looking up commit status. */
  readonly repository: GitHubRepository

  /** When a drag element has landed on a pull request */
  readonly onDropOntoPullRequest: (prNumber: number) => void

  /** When mouse enters a PR */
  readonly onMouseEnter: (prNumber: number, prListItemTop: number) => void

  /** When mouse leaves a PR */
  readonly onMouseLeave: (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => void
}

interface IPullRequestListItemState {
  readonly isDragInProgress: boolean
}

/** Pull requests as rendered in the Pull Requests list. */
export class PullRequestListItem extends React.Component<
  IPullRequestListItemProps,
  IPullRequestListItemState
> {
  public constructor(props: IPullRequestListItemProps) {
    super(props)
    this.state = { isDragInProgress: false }
  }

  private getSubtitle() {
    if (this.props.loading === true) {
      return undefined
    }

    const timeAgo = formatRelative(this.props.created.getTime() - Date.now())
    const subtitle = `#${this.props.number} opened ${timeAgo} by ${this.props.author}`

    return this.props.draft ? `${subtitle} • Draft` : subtitle
  }

  private onMouseEnter = (e: React.MouseEvent) => {
    if (dragAndDropManager.isDragInProgress) {
      this.setState({ isDragInProgress: true })

      dragAndDropManager.emitEnterDropTarget({
        type: DropTargetType.Branch,
        branchName: this.props.title,
      })
    }
    const { top } = e.currentTarget.getBoundingClientRect()
    this.props.onMouseEnter(this.props.number, top)
  }

  private onMouseLeave = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    if (dragAndDropManager.isDragInProgress) {
      this.setState({ isDragInProgress: false })

      dragAndDropManager.emitLeaveDropTarget()
    }
    this.props.onMouseLeave(event)
  }

  private onMouseUp = () => {
    if (dragAndDropManager.isDragInProgress) {
      this.setState({ isDragInProgress: false })

      this.props.onDropOntoPullRequest(this.props.number)
    }
  }

  public render() {
    const title = this.props.loading === true ? undefined : this.props.title
    const subtitle = this.getSubtitle()
    const matches = this.props.matches
    const className = classNames('pull-request-item', {
      loading: this.props.loading === true,
      open: !this.props.draft,
      draft: this.props.draft,
      'drop-target': this.state.isDragInProgress,
    })

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        className={className}
        onMouseEnter={this.onMouseEnter}
        onMouseLeave={this.onMouseLeave}
        onMouseUp={this.onMouseUp}
      >
        <div>
          <Octicon
            className="icon"
            symbol={
              this.props.draft
                ? octicons.gitPullRequestDraft
                : octicons.gitPullRequest
            }
          />
        </div>
        <div className="info">
          <TooltippedContent
            tagName="div"
            className="title"
            tooltip={title}
            onlyWhenOverflowed={true}
          >
            <HighlightText text={title || ''} highlight={matches.title} />
          </TooltippedContent>
          <TooltippedContent
            tagName="div"
            className="subtitle"
            tooltip={subtitle}
            onlyWhenOverflowed={true}
          >
            <HighlightText text={subtitle || ''} highlight={matches.subtitle} />
          </TooltippedContent>
        </div>
        {this.renderPullRequestStatus()}
      </div>
    )
  }

  private renderPullRequestStatus() {
    const ref = getPullRequestCommitRef(this.props.number)
    return (
      <div className="ci-status-container">
        <CIStatus
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          commitRef={ref}
        />
      </div>
    )
  }
}
