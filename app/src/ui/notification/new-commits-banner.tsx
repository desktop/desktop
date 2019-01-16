import * as React from 'react'
import { Ref } from '../lib/ref'
import Octicon, * as OcticonSymbol from '@githubprimer/octicons-react'
import { Branch } from '../../models/branch'
import { Button } from '../lib/button'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { HistoryTabMode, ComparisonMode } from '../../lib/app-state'
import { PopupType } from '../../models/popup'

export type DismissalReason = 'close' | 'compare' | 'merge'

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
  readonly onDismiss: (reason: DismissalReason) => void
}

/**
 * Banner used to notify user that their branch is a number of commits behind the base branch
 */
export class NewCommitsBanner extends React.Component<
  INewCommitsBannerProps,
  {}
> {
  public render() {
    const pluralize = this.props.commitsBehindBaseBranch > 1

    return (
      <div className="notification-banner diverge-banner">
        <Octicon icon={OcticonSymbol.lightBulb} className="notification-icon" />

        <div className="notification-banner-content">
          <div className="notification-banner-content-body">
            <p>
              We have noticed that your branch is{' '}
              <strong>
                {this.props.commitsBehindBaseBranch} commit
                {pluralize ? 's' : ''}
              </strong>{' '}
              behind <Ref>{this.props.baseBranch.name}</Ref>.
            </p>
          </div>
          <div>
            <Button className="small-button" onClick={this.onComparedClicked}>
              View commits
            </Button>
            <Button
              className="small-button"
              type="submit"
              onClick={this.onMergeClicked}
            >
              Merge...
            </Button>
          </div>
        </div>

        <a
          className="close"
          aria-label="Dismiss banner"
          onClick={this.onDismissed}
        >
          <Octicon icon={OcticonSymbol.X} />
        </a>
      </div>
    )
  }

  private onDismissed = () => {
    this.props.onDismiss('close')
  }

  private onComparedClicked = () => {
    const { repository, dispatcher } = this.props

    dispatcher.executeCompare(repository, {
      kind: HistoryTabMode.Compare,
      branch: this.props.baseBranch,
      comparisonMode: ComparisonMode.Behind,
    })
    dispatcher.recordDivergingBranchBannerInitiatedCompare()
    this.props.onDismiss('compare')
  }

  private onMergeClicked = () => {
    const { repository, dispatcher } = this.props

    dispatcher.showPopup({
      type: PopupType.MergeBranch,
      branch: this.props.baseBranch,
      repository,
    })
    dispatcher.recordDivergingBranchBannerInitatedMerge()
    this.props.onDismiss('merge')
  }
}
