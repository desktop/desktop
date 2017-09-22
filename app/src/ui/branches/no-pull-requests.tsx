import * as React from 'react'
import { Ref } from '../lib/ref'
import { LinkButton } from '../lib/link-button'

interface INoPullRequestsProps {
  readonly repositoryName: string
  readonly isOnDefaultBranch: boolean
  readonly onCreateBranch: () => void
  readonly onCreatePullRequest: () => void
}

export class NoPullRequests extends React.Component<INoPullRequestsProps, {}> {
  public render() {
    return (
      <div className="no-pull-requests">
        <div className="title">You're all set!</div>

        <div>
          No open pull requests in <Ref>{this.props.repositoryName}</Ref>
        </div>

        {this.renderCallToAction()}
      </div>
    )
  }

  private renderCallToAction() {
    if (this.props.isOnDefaultBranch) {
      return (
        <div>
          Would you like to{' '}
          <LinkButton onClick={this.props.onCreateBranch}>
            create a new branch
          </LinkButton>{' '}
          and get going on your next project?
        </div>
      )
    } else {
      return (
        <div>
          Would you like to{' '}
          <LinkButton onClick={this.props.onCreatePullRequest}>
            create a pull request
          </LinkButton>{' '}
          from the current branch?
        </div>
      )
    }
  }
}
