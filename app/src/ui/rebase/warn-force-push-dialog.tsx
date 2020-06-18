import * as React from 'react'

import { Repository } from '../../models/repository'
import { WarnForcePushStep } from '../../models/rebase-flow-step'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dispatcher } from '../dispatcher'
import { DialogFooter, DialogContent, Dialog } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

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

    const title = __DARWIN__
      ? 'Rebase Will Require Force Push'
      : 'Rebase will require force push'

    return (
      <Dialog
        title={title}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onBeginRebase}
        dismissable={false}
        type="warning"
      >
        <DialogContent>
          <p>
            Are you sure you want to rebase <Ref>{targetBranch.name}</Ref> onto{' '}
            <Ref>{baseBranch.name}</Ref>?
          </p>
          <p>
            At the end of the rebase flow, GitHub Desktop will enable you to
            force push the branch to update the upstream branch. Force pushing
            will alter the history on the remote and potentially cause problems
            for others collaborating on this branch.
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
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Begin Rebase' : 'Begin rebase'}
            onCancelButtonClick={this.props.onDismissed}
          />
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

  private onBeginRebase = async () => {
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
