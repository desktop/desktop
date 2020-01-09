import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { DialogHeader } from '../dialog/header'

interface ICreateForkDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly onDismissed: () => void
}

interface ICreateForkDialogState {
  readonly loading: boolean
}

/**
 * Dialog offering to make a fork of the given repository
 */
export class CreateForkDialog extends React.Component<
  ICreateForkDialogProps,
  ICreateForkDialogState
> {
  public constructor(props: ICreateForkDialogProps) {
    super(props)
    this.state = { loading: false }
  }
  /**
   *  Starts fork process on GitHub!
   */
  private onSubmit = async () => {
    this.setState({ loading: true })
    await this.props.dispatcher.createFork(this.props.repository)
    this.setState({ loading: false })
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        type="normal"
      >
        <DialogHeader
          title="Do you want to fork this repository?"
          dismissable={!this.state.loading}
          onDismissed={this.props.onDismissed}
          loading={this.state.loading}
        />
        <DialogContent>
          Looks like you don’t have write access to this repository. Do you want
          to fork this repository to continue?
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={
              __DARWIN__ ? 'Fork This Repository' : 'Fork this repository'
            }
            okButtonDisabled={this.state.loading}
            cancelButtonDisabled={this.state.loading}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
