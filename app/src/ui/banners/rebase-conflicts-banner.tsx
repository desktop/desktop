import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'
import { Dispatcher } from '../dispatcher'
import { Popup } from '../../models/popup'
import { LinkButton } from '../lib/link-button'

interface IRebaseConflictsBannerProps {
  readonly dispatcher: Dispatcher
  /** branch the user is rebasing into */
  readonly targetBranch: string
  /** rebase conflicts dialog popup to be shown by this banner */
  readonly popup: Popup
  readonly onDismissed: () => void
}

export class RebaseConflictsBanner extends React.Component<
  IRebaseConflictsBannerProps,
  {}
> {
  private openDialog = () => {
    this.props.onDismissed()
    this.props.dispatcher.showPopup(this.props.popup)
    this.props.dispatcher.recordRebaseConflictsDialogReopened()
  }

  public render() {
    return (
      <Banner
        id="rebase-conflicts-banner"
        dismissable={false}
        onDismissed={this.props.onDismissed}
      >
        <Octicon className="alert-icon" symbol={OcticonSymbol.alert} />
        <div className="banner-message">
          <span>
            Resolve conflicts to continue rebasing{' '}
            <strong>{this.props.targetBranch}</strong>.
          </span>
          <LinkButton onClick={this.openDialog}>View conflicts</LinkButton>
        </div>
      </Banner>
    )
  }
}
