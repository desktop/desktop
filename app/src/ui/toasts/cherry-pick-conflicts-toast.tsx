import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { ToastNotification } from './toast-notification'
import { LinkButton } from '../lib/link-button'

interface ICherryPickConflictsToastProps {
  /** branch the user is rebasing into */
  readonly targetBranchName: string
  /** callback to fire when the dialog should be reopened */
  readonly onOpenConflictsDialog: () => void
  /** callback to fire to dismiss the toast */
  readonly onDismissed: () => void
}

export class CherryPickConflictsToast extends React.Component<
  ICherryPickConflictsToastProps,
  {}
> {
  private openDialog = async () => {
    this.props.onDismissed()
    this.props.onOpenConflictsDialog()
  }

  private onDismissed = () => {
    log.warn(
      `[CherryPickConflictsToast] this is not dismissable by default unless the user clicks on the link`
    )
  }

  public render() {
    return (
      <ToastNotification
        id="cherry-pick-conflicts-toast"
        dismissable={false}
        onDismissed={this.onDismissed}
      >
        <Octicon className="alert-icon" symbol={octicons.alert} />
        <div className="toast-message">
          <span>
            Resolve conflicts to continue cherry-picking onto{' '}
            <strong>{this.props.targetBranchName}</strong>.
          </span>
          <LinkButton onClick={this.openDialog}>View conflicts</LinkButton>
        </div>
      </ToastNotification>
    )
  }
}
