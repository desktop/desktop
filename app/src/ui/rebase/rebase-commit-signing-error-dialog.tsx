import * as React from 'react'

import { Repository } from '../../models/repository'
import { ShowSigningErrorStep } from '../../models/rebase-flow-step'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dispatcher } from '../dispatcher'
import { DialogFooter, DialogContent, Dialog } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IRebaseCommitSigningErrorProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly step: ShowSigningErrorStep
  readonly askForConfirmationOnSigningError: boolean
  readonly onContinueRebase: (step: ShowSigningErrorStep) => void
  readonly onAbortRebase: () => void
}

interface IRebaseCommitSigningErrorState {
  readonly askForConfirmationOnSigningError: boolean
}

export class RebaseCommitSigningErrorDialog extends React.Component<
  IRebaseCommitSigningErrorProps,
  IRebaseCommitSigningErrorState
> {
  public constructor(props: IRebaseCommitSigningErrorProps) {
    super(props)

    this.state = {
      askForConfirmationOnSigningError: props.askForConfirmationOnSigningError,
    }
  }

  public render() {
    return (
      <Dialog
        title={'Error'}
        onDismissed={this.onAbortRebase}
        onSubmit={this.onContinueRebase}
        dismissable={false}
        type="error"
      >
        <DialogContent>
          <p>
            We were unable sign your commit at this time. However, you can
            continue rebasing without signing the remaining commits.
          </p>
          <div>
            <Checkbox
              label="Always continue without signing when Desktop is unable to sign your commits"
              value={
                this.state.askForConfirmationOnSigningError
                  ? CheckboxValue.Off
                  : CheckboxValue.On
              }
              onChange={this.onAskForConfirmationOnSigningErrorChanged}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Continue Anyway' : 'Continue anyway'}
            cancelButtonText={__DARWIN__ ? 'Abort Rebase' : 'Abort rebase'}
            onCancelButtonClick={this.onAbortRebase}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onAskForConfirmationOnSigningErrorChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ askForConfirmationOnSigningError: value })
  }

  private onAbortRebase = () => {
    this.props.onAbortRebase()
  }

  private onContinueRebase = () => {
    this.props.dispatcher.setConfirmCommitWithoutSigningSetting(
      this.state.askForConfirmationOnSigningError
    )

    this.props.onContinueRebase(this.props.step)
  }
}
