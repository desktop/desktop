import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { ICommitContext } from '../../models/commit'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IPreCommitHookFailureProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly commitContext: ICommitContext
  readonly hookOutput: string
  readonly onDismissed: () => void
}

interface IPreCommitHookFailureState {
  /**
   * Whether or not we're currently in the process of
   * committing with --no-verify. This is used to display a loading state
   */
  readonly isCommitting: boolean
}

/** A component to handle pre-commit hook failures with bypass option. */
export class PreCommitHookFailure extends React.Component<
  IPreCommitHookFailureProps,
  IPreCommitHookFailureState
> {
  public constructor(props: IPreCommitHookFailureProps) {
    super(props)

    this.state = {
      isCommitting: false,
    }
  }

  public render() {
    const title = __DARWIN__ ? 'Pre-commit Hook Failed' : 'Pre-commit hook failed'

    return (
      <Dialog
        id="pre-commit-hook-failure"
        type="error"
        title={title}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onCommitAnyway}
        loading={this.state.isCommitting}
        disabled={this.state.isCommitting}
        role="alertdialog"
        ariaDescribedBy="pre-commit-hook-failure-description"
      >
        <DialogContent>
          <div id="pre-commit-hook-failure-description" className="selectable-text">
            <p>
              The pre-commit hook failed to run successfully. The hook output is shown below:
            </p>
            <div className="hook-output">
              <pre className="selectable-text">{this.props.hookOutput}</pre>
            </div>
            <p>
              You can bypass the pre-commit hook by committing anyway. This is not recommended unless you are sure your changes are correct.
            </p>
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={
              this.state.isCommitting
                ? 'Committing…'
                : 'Commit Anyway'
            }
            cancelButtonText="Cancel"
            onOkButtonClick={this.onCommitAnyway}
            onCancelButtonClick={this.props.onDismissed}
            okButtonDisabled={this.state.isCommitting}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onCommitAnyway = async () => {
    this.setState({ isCommitting: true })

    try {
      const contextWithNoVerify: ICommitContext = {
        ...this.props.commitContext,
        noVerify: true,
      }

      await this.props.dispatcher.commitIncludedChanges(
        this.props.repository,
        contextWithNoVerify
      )
      // Close the dialog after successful commit
      this.props.onDismissed()
    } finally {
      this.setState({ isCommitting: false })
    }
  }
}
