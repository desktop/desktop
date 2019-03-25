import * as React from 'react'
import { CIStatus } from './ci-status'
import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../dispatcher'

interface IPullRequestBadgeProps {
  /** The pull request's number. */
  readonly number: number

  readonly dispatcher: Dispatcher
  readonly repository: GitHubRepository
}

/** The pull request info badge. */
export class PullRequestBadge extends React.Component<
  IPullRequestBadgeProps,
  {}
> {
  public render() {
    const ref = `refs/pull/${this.props.number}/head`
    return (
      <div className="pr-badge">
        <span className="number">#{this.props.number}</span>
        <CIStatus
          commitRef={ref}
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
        />
      </div>
    )
  }
}
