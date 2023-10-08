import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'
import { restartApp } from '../main-process-proxy'

interface IConfirmRestartProps {
  /**
   * Callback to use when the dialog gets closed.
   */
  readonly onDismissed: () => void
}

export class ConfirmRestart extends React.Component<IConfirmRestartProps> {
  public constructor(props: IConfirmRestartProps) {
    super(props)
  }

  public render() {
    return (
      <Dialog
        dismissDisabled={true}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        type="warning"
      >
        <DialogContent>
          <p>Restart GitHub Desktop to apply the title bar settings change?</p>
        </DialogContent>
        {this.renderFooter()}
      </Dialog>
    )
  }

  private renderFooter() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText="Restart"
          cancelButtonText="Not Now"
          onCancelButtonClick={this.onNotNow}
        />
      </DialogFooter>
    )
  }

  private onNotNow = () => {
    this.props.onDismissed()
  }

  private onSubmit = async () => {
    this.props.onDismissed()
    restartApp()
  }
}
