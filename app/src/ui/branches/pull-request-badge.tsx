import * as React from 'react'
import { CIStatus } from './ci-status'
import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../dispatcher'
import { ICombinedRefCheck } from '../../lib/stores/commit-status-store'
import { enableCICheckRuns } from '../../lib/feature-flag'

interface IPullRequestBadgeProps {
  /** The pull request's number. */
  readonly number: number

  readonly dispatcher: Dispatcher

  /** The GitHub repository to use when looking up commit status. */
  readonly repository: GitHubRepository

  /** The GitHub repository to use when looking up commit status. */
  readonly onBadgeClick: () => void
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
  public constructor(props: IPullRequestBadgeProps) {
    super(props)
    this.state = {
      isStatusShowing: false,
    }
  }

  private onBadgeClick = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    if (!this.state.isStatusShowing || !enableCICheckRuns()) {
      return
    }

    event.stopPropagation()
    this.props.onBadgeClick()
  }

  private onCheckChange = (check: ICombinedRefCheck | null) => {
    this.setState({ isStatusShowing: check !== null })
  }

  public render() {
    const ref = `refs/pull/${this.props.number}/head`
    return (
      <div id="pr-badge" onClick={this.onBadgeClick}>
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
