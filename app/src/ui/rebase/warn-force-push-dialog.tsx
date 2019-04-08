import * as React from 'react'

import { Repository } from '../../models/repository'
import { WarnForcePushStep } from '../../models/rebase-flow-step'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

import { Dispatcher } from '../dispatcher'
import { DialogFooter, DialogContent, Dialog } from '../dialog'

interface IWarnForcePushProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly step: WarnForcePushStep
  readonly askForConfirmationOnForcePush: boolean
  readonly onDismissed: () => void
}

interface IWarnForcePushState {
  readonly askForConfirmationOnForcePush: boolean
}

export class WarnForcePushDialog extends React.Component<
  IWarnForcePushProps,
  IWarnForcePushState
> {
  public constructor(props: IWarnForcePushProps) {
    super(props)

    this.state = {
      askForConfirmationOnForcePush: props.askForConfirmationOnForcePush,
    }
  }

  public render() {
    const { baseBranch, targetBranch } = this.props.step

    return (
      <Dialog
        title="This rebase will require a force push"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onContinueRebase}
        type="warning"
      >
        <DialogContent>
          <p>
            Are you sure you want to rebase <strong>{targetBranch.name}</strong>{' '}
            onto <strong>{baseBranch.name}</strong>?
          </p>
          <p>
            This rebase will rewrite history and require a force push to update
            the remote branch.
          </p>
          <div>
            <Checkbox
              label="Do not show this message again"
              value={
                this.state.askForConfirmationOnForcePush
                  ? CheckboxValue.Off
                  : CheckboxValue.On
              }
              onChange={this.onAskForConfirmationOnForcePushChanged}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Continue rebase</Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onAskForConfirmationOnForcePushChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ askForConfirmationOnForcePush: value })
  }

  private onContinueRebase = async () => {
    this.props.dispatcher.setConfirmForcePushSetting(
      this.state.askForConfirmationOnForcePush
    )

    const { baseBranch, targetBranch, commits } = this.props.step

    await this.props.dispatcher.startRebase(
      this.props.repository,
      baseBranch,
      targetBranch,
      commits,
      { continueWithForcePush: true }
    )
  }
}
