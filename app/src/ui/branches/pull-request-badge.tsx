import * as React from 'react'
import { CIStatus } from './ci-status'
import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../dispatcher'
import { PullRequestRef } from '../../models/pull-request'

interface IPullRequestBadgeProps {
  /** The pull request's number. */
  readonly number: number

  readonly dispatcher: Dispatcher
  readonly repository: GitHubRepository
  readonly head: PullRequestRef
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
        <CIStatus
          commitRef={this.props.head.ref}
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
        />
      </div>
    )
  }
}
