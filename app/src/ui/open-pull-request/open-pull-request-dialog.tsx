import * as React from 'react'
import { Dialog, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IOpenPullRequestDialogProps {
  /** Called to dismiss the dialog */
  readonly onDismissed: () => void
}

/** The component for viewing the diff of a pull request. */
export class OpenPullRequestDialog extends React.Component<IOpenPullRequestDialogProps> {
  private renderControls() {
    return <>Controls Here</>
  }

  private renderDiff() {
    return <>Diff Here</>
  }

  private renderFooter() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup cancelButtonVisible={false} />
      </DialogFooter>
    )
  }

  public render() {
    return (
      <Dialog
        className="create-pull-request"
        title={__DARWIN__ ? 'Open a Pull Request' : 'Open a pull request'}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        {this.renderControls()}
        {this.renderDiff()}
        {this.renderFooter()}
      </Dialog>
    )
  }
}
