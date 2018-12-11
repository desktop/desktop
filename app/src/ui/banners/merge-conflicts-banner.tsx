import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'
import { Dispatcher } from '../../lib/dispatcher'
import { Popup } from '../../models/popup'
import { LinkButton } from '../lib/link-button'

interface IMergeConflictsBannerProps {
  readonly dispatcher: Dispatcher
  readonly ourBranch: string
  readonly popup: Popup
  readonly onDismissed: () => void
}

export class MergeConflictsBanner extends React.Component<
  IMergeConflictsBannerProps,
  {}
> {
  private openDialog = () => {
    this.props.onDismissed()
    this.props.dispatcher.showPopup(this.props.popup)
  }
  public render() {
    return (
      <Banner
        id="merge-conflicts-banner"
        dismissable={false}
        onDismissed={this.props.onDismissed}
      >
        <Octicon className="alert-icon" symbol={OcticonSymbol.alert} />
        <div className="banner-message">
          <span>
            Resolve conflicts and commit to merge into{' '}
            <strong>{this.props.ourBranch}</strong>.
          </span>
          <LinkButton onClick={this.openDialog}>View conflicts</LinkButton>
        </div>
      </Banner>
    )
  }
}
