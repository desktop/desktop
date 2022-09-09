import * as React from 'react'
import { IPullRequestState } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { DialogFooter, OkCancelButtonGroup, Dialog } from '../dialog'
import { Dispatcher } from '../dispatcher'

interface IOpenPullRequestDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly pullRequestState: IPullRequestState

  /** Called to dismiss the dialog */
  readonly onDismissed: () => void
}

/** The component for start a pull request. */
export class OpenPullRequestDialog extends React.Component<IOpenPullRequestDialogProps> {
  private onCreatePullRequest = () => {
    this.props.dispatcher.createPullRequest(this.props.repository)
    // TODO: create pr from dialog pr stat?
    this.props.dispatcher.recordCreatePullRequest()
  }

  private renderHeader() {}

  private renderContent() {}

  private renderFooter() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText="Create Pull Request"
          okButtonTitle="Create pull request on GitHub."
          cancelButtonText="Cancel"
        />
      </DialogFooter>
    )
  }

  public render() {
    return (
      <Dialog
        className="open-pull-request"
        title={__DARWIN__ ? 'Open a Pull Request' : 'Open a pull request'}
        onSubmit={this.onCreatePullRequest}
        onDismissed={this.props.onDismissed}
      >
        <div className="content">
          {this.renderHeader()}
          {this.renderContent()}
        </div>

        {this.renderFooter()}
      </Dialog>
    )
  }
}
