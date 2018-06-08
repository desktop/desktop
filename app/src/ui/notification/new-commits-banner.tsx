import * as React from 'react'
import { Ref } from '../lib/ref'
import { Octicon, OcticonSymbol } from '../octicons'
import { Branch } from '../../models/branch'

interface INewCommitsBannerProps {
  /**
   * The number of commits behind `baseBranch`
   */
  readonly commitsBehindBaseBranch: number

  /**
   * The target branch that will accept commits
   * from the current branch
   */
  readonly baseBranch: Branch

  readonly onDismiss: () => void
}

/**
 * Banner used to notify user that there branch is _commitsBehind_
 * commits behind `branch`
 */
export class NewCommitsBanner extends React.Component<
  INewCommitsBannerProps,
  {}
> {
  public render() {
    return (
      <div className="notification-banner diverge-banner">
        <Octicon
          symbol={OcticonSymbol.lightBulb}
          className="notification-icon"
        />

        <div className="notification-banner-content">
          <div>
            <p>
              Your branch is{' '}
              <strong>{this.props.commitsBehindBaseBranch} commits</strong>{' '}
              behind <Ref>{this.props.baseBranch.name}</Ref>.
            </p>

            <p className="notification-banner-content-body">
              You can view these commits using the form below.
            </p>
          </div>
        </div>

        <a
          className="close"
          aria-label="Dismiss banner"
          onClick={this.props.onDismiss}
        >
          <Octicon symbol={OcticonSymbol.x} />
        </a>
      </div>
    )
  }
}
