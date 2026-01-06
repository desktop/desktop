import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { ToastNotification } from './toast-notification'
import { Dispatcher } from '../dispatcher'
import { Popup } from '../../models/popup'
import { LinkButton } from '../lib/link-button'

interface IMergeConflictsToastProps {
  readonly dispatcher: Dispatcher
  /** branch the user is merging into */
  readonly ourBranch: string
  /** merge conflicts dialog popup to be shown by this toast */
  readonly popup: Popup
  readonly onDismissed: () => void
}

export class MergeConflictsToast extends React.Component<
  IMergeConflictsToastProps,
  {}
> {
  private openDialog = () => {
    this.props.onDismissed()
    this.props.dispatcher.showPopup(this.props.popup)
    this.props.dispatcher.incrementMetric('mergeConflictsDialogReopenedCount')
  }
  public render() {
    return (
      <ToastNotification
        id="merge-conflicts-toast"
        dismissable={false}
        onDismissed={this.props.onDismissed}
      >
        <Octicon className="alert-icon" symbol={octicons.alert} />
        <div className="toast-message">
          <span>
            Resolve conflicts and commit to merge into{' '}
            <strong>{this.props.ourBranch}</strong>.
          </span>
          <LinkButton onClick={this.openDialog}>View conflicts</LinkButton>
        </div>
      </ToastNotification>
    )
  }
}
