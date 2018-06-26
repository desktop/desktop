import * as React from 'react'
import { Ref } from '../lib/ref'
import { Octicon, OcticonSymbol } from '../octicons'
import { Branch } from '../../models/branch'
import { Button } from '../lib/button'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { CompareActionKind, ComparisonView } from '../../lib/app-state'

interface INewCommitsBannerProps {
  readonly dispatcher: Dispatcher

  readonly repository: Repository

  /**
   * The number of commits behind base branch
   */
  readonly commitsBehindBaseBranch: number

  /**
   * The target branch that will accept commits
   * from the current branch
   */
  readonly baseBranch: Branch

  /**
   * Callback used to dismiss the banner
   */
  readonly onDismiss: (reason?: string) => void
}

/**
 * Banner used to notify user that their branch is a number of commits behind the base branch
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
              We have noticed that your branch is{' '}
              <strong>{this.props.commitsBehindBaseBranch} commits</strong>{' '}
              behind <Ref>{this.props.baseBranch.name}</Ref>.
            </p>
          </div>
        </div>

        <a
          className="close"
          aria-label="Dismiss banner"
          onClick={this.onDismissed}
        >
          <Octicon symbol={OcticonSymbol.x} />
        </a>
        <div className="notification-banner-cta">
          <Button onClick={this.onComparedClicked}>Compare</Button>
        </div>
      </div>
    )
  }

  private onDismissed = () => {
    this.props.onDismiss()
  }

  private onComparedClicked = () => {
    const { repository, dispatcher } = this.props

    dispatcher.executeCompare(repository, {
      kind: CompareActionKind.Branch,
      branch: this.props.baseBranch,
      mode: ComparisonView.Behind,
    })
    dispatcher.recordDivergingBranchBannerInitiatedCompare()
    this.props.onDismiss("compare")
  }
}
