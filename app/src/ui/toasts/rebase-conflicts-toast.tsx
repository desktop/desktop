import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { ToastNotification } from './toast-notification'
import { Dispatcher } from '../dispatcher'
import { LinkButton } from '../lib/link-button'

interface IRebaseConflictsToastProps {
  readonly dispatcher: Dispatcher
  /** branch the user is rebasing into */
  readonly targetBranch: string
  /** callback to fire when the dialog should be reopened */
  readonly onOpenDialog: () => void
  /** callback to fire to dismiss the toast */
  readonly onDismissed: () => void
}

export class RebaseConflictsToast extends React.Component<
  IRebaseConflictsToastProps,
  {}
> {
  private openDialog = async () => {
    this.props.onDismissed()
    this.props.onOpenDialog()
    this.props.dispatcher.incrementMetric('rebaseConflictsDialogReopenedCount')
  }

  private onDismissed = () => {
    log.warn(
      `[RebaseConflictsToast] this is not dismissable by default unless the user clicks on the link`
    )
  }

  public render() {
    return (
      <ToastNotification
        id="rebase-conflicts-toast"
        dismissable={false}
        onDismissed={this.onDismissed}
      >
        <Octicon className="alert-icon" symbol={octicons.alert} />
        <div className="toast-message">
          <span>
            Resolve conflicts to continue rebasing{' '}
            <strong>{this.props.targetBranch}</strong>.
          </span>
          <LinkButton onClick={this.openDialog}>View conflicts</LinkButton>
        </div>
      </ToastNotification>
    )
  }
}
