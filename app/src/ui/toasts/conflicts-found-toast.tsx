import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { ToastNotification } from './toast-notification'
import { LinkButton } from '../lib/link-button'

interface IConflictsFoundToastProps {
  /**
   * Description of the operation to continue
   * Examples:
   *  - rebasing <strong>target-branch-name</strong>
   *  - cherry-picking onto <strong>target-branch-name</strong>
   *  - squashing commits on <strong>target-branch-name</strong>
   */
  readonly operationDescription: string | JSX.Element
  /** Callback to fire when the dialog should be reopened */
  readonly onOpenConflictsDialog: () => void
  /** Callback to fire to dismiss the toast */
  readonly onDismissed: () => void
}

export class ConflictsFoundToast extends React.Component<
  IConflictsFoundToastProps,
  {}
> {
  private openDialog = async () => {
    this.props.onDismissed()
    this.props.onOpenConflictsDialog()
  }

  private onDismissed = () => {
    log.warn(
      `[ConflictsFoundToast] This cannot be dismissed by default unless the user clicks on the link`
    )
  }

  public render() {
    return (
      <ToastNotification
        id="conflicts-found-toast"
        dismissable={false}
        onDismissed={this.onDismissed}
      >
        <Octicon className="alert-icon" symbol={octicons.alert} />
        <div className="toast-message">
          <span>
            Resolve conflicts to continue {this.props.operationDescription}.
          </span>
          <LinkButton onClick={this.openDialog}>View conflicts</LinkButton>
        </div>
      </ToastNotification>
    )
  }
}
