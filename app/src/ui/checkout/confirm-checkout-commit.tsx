import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { CommitOneLine } from '../../models/commit'

interface IConfirmCheckoutCommitProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly commit: CommitOneLine
  readonly askForConfirmationOnCheckoutCommit: boolean
  readonly onDismissed: () => void
}

interface IConfirmCheckoutCommitState {
  readonly isCheckingOut: boolean
  readonly confirmCheckoutCommit: boolean
}
/**
 * Dialog to confirm checking out a commit
 */
export class ConfirmCheckoutCommitDialog extends React.Component<
  IConfirmCheckoutCommitProps,
  IConfirmCheckoutCommitState
> {
  public constructor(props: IConfirmCheckoutCommitProps) {
    super(props)

    this.state = {
      isCheckingOut: false,
      confirmCheckoutCommit: props.askForConfirmationOnCheckoutCommit,
    }
  }

  public render() {
    const title = __DARWIN__ ? 'Checkout Commit?' : 'Checkout commit?'

    return (
      <Dialog
        id="checkout-commit"
        type="warning"
        title={title}
        loading={this.state.isCheckingOut}
        disabled={this.state.isCheckingOut}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        ariaDescribedBy="checking-out-commit-confirmation"
        role="alertdialog"
      >
        <DialogContent>
          <Row id="checking-out-commit-confirmation">
            Checking out a commit will create a detached HEAD, and you will no
            longer be on any branch. Are you sure you want to checkout this
            commit?
          </Row>
          <Row>
            <Checkbox
              label="Do not show this message again"
              value={
                this.state.confirmCheckoutCommit
                  ? CheckboxValue.Off
                  : CheckboxValue.On
              }
              onChange={this.onaskForConfirmationOnCheckoutCommitChanged}
            />
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Checkout" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onaskForConfirmationOnCheckoutCommitChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ confirmCheckoutCommit: value })
  }

  private onSubmit = async () => {
    const { dispatcher, repository, commit, onDismissed } = this.props

    this.setState({
      isCheckingOut: true,
    })

    try {
      dispatcher.setConfirmCheckoutCommitSetting(
        this.state.confirmCheckoutCommit
      )
      await dispatcher.checkoutCommit(repository, commit)
    } finally {
      this.setState({
        isCheckingOut: false,
      })
    }

    onDismissed()
  }
}
