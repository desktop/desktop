import * as React from 'react'
import { CIStatus } from './ci-status'
import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../dispatcher'
import { ICombinedRefCheck } from '../../lib/ci-checks/ci-checks'
import { getPullRequestCommitRef } from '../../models/pull-request'

interface IPullRequestBadgeProps {
  /** The pull request's number. */
  readonly number: number

  readonly dispatcher: Dispatcher

  /** The GitHub repository to use when looking up commit status. */
  readonly repository: GitHubRepository

  /** The GitHub repository to use when looking up commit status. */
  readonly onBadgeClick?: () => void

  /** When the bottom edge of the pull request badge position changes. For
   * example, on a mac, this changes when the user maximizes Desktop. */
  readonly onBadgeBottomPositionUpdate?: (bottom: number) => void
}

interface IPullRequestBadgeState {
  /** Whether or not the CI status is showing a status */
  readonly isStatusShowing: boolean
}

/** The pull request info badge. */
export class PullRequestBadge extends React.Component<
  IPullRequestBadgeProps,
  IPullRequestBadgeState
> {
  private badgeRef: HTMLDivElement | null = null
  private badgeBoundingBottom: number = 0

  public constructor(props: IPullRequestBadgeProps) {
    super(props)
    this.state = {
      isStatusShowing: false,
    }
  }

  public componentDidUpdate() {
    if (this.badgeRef === null) {
      return
    }

    if (
      this.badgeRef.getBoundingClientRect().bottom !== this.badgeBoundingBottom
    ) {
      this.badgeBoundingBottom = this.badgeRef.getBoundingClientRect().bottom
      this.props.onBadgeBottomPositionUpdate?.(this.badgeBoundingBottom)
    }
  }

  private onRef = (badgeRef: HTMLDivElement) => {
    this.badgeRef = badgeRef
  }

  private onBadgeClick = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    if (!this.state.isStatusShowing) {
      return
    }

    event.stopPropagation()
    this.props.onBadgeClick?.()
  }

  private onCheckChange = (check: ICombinedRefCheck | null) => {
    this.setState({ isStatusShowing: check !== null })
  }

  public render() {
    const ref = getPullRequestCommitRef(this.props.number)
    return (
      <div className="pr-badge" onClick={this.onBadgeClick} ref={this.onRef}>
        <span className="number">#{this.props.number}</span>
        <CIStatus
          commitRef={ref}
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          onCheckChange={this.onCheckChange}
        />
      </div>
    )
  }
}
