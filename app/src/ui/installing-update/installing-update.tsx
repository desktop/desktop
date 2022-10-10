import * as React from 'react'

import { Row } from '../lib/row'
import {
  Dialog,
  DialogContent,
  OkCancelButtonGroup,
  DialogFooter,
} from '../dialog'
import { updateStore, IUpdateState, UpdateStatus } from '../lib/update-store'
import { Disposable } from 'event-kit'
import { DialogHeader } from '../dialog/header'
import { Dispatcher } from '../dispatcher'

interface IInstallingUpdateProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void

  readonly dispatcher: Dispatcher
}

/**
 * A dialog that presents information about the
 * running application such as name and version.
 */
export class InstallingUpdate extends React.Component<IInstallingUpdateProps> {
  private updateStoreEventHandle: Disposable | null = null

  public constructor(props: IInstallingUpdateProps) {
    super(props)
  }

  private onUpdateStateChanged = (updateState: IUpdateState) => {
    // If the update is not being downloaded (`UpdateStatus.UpdateAvailable`),
    // i.e. if it's already downloaded or not available, close the window.
    if (updateState.status !== UpdateStatus.UpdateAvailable) {
      this.props.dispatcher.quitApp(false)
    }
  }

  public componentDidMount() {
    this.updateStoreEventHandle = updateStore.onDidChange(
      this.onUpdateStateChanged
    )

    // Manually update the state to ensure we're in sync with the store
    this.onUpdateStateChanged(updateStore.state)
  }

  public componentWillUnmount() {
    if (this.updateStoreEventHandle) {
      this.updateStoreEventHandle.dispose()
      this.updateStoreEventHandle = null
    }
  }

  private onQuitAnywayButtonClicked = () => {
    this.props.dispatcher.quitApp(true)
  }

  private onCancel = () => {
    this.props.dispatcher.cancelQuittingApp()
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id="installing-update"
        onSubmit={this.props.onDismissed}
        dismissable={false}
      >
        <DialogHeader
          title={__DARWIN__ ? 'Installing Update…' : 'Installing update…'}
          loading={true}
          dismissable={true}
          onDismissed={this.onCancel}
        />
        <DialogContent>
          <Row className="updating-message">
            Please, do not close GitHub Desktop until the update is completely
            installed.
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Quit Anyway' : 'Quit anyway'}
            onOkButtonClick={this.onQuitAnywayButtonClicked}
            onCancelButtonClick={this.onCancel}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
