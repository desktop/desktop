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
import { Loading } from '../lib/loading'
import { assertNever } from '../../lib/fatal-error'
import {
  closeWindow,
  sendWillQuitEvenUpdatingSync,
  sendWillQuitSync,
} from '../main-process-proxy'
import { DialogHeader } from '../dialog/header'
import { app } from 'electron'

interface IInstallingUpdateProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

interface IInstallingUpdateState {
  readonly updateState: IUpdateState
}

/**
 * A dialog that presents information about the
 * running application such as name and version.
 */
export class InstallingUpdate extends React.Component<
  IInstallingUpdateProps,
  IInstallingUpdateState
> {
  private updateStoreEventHandle: Disposable | null = null

  public constructor(props: IInstallingUpdateProps) {
    super(props)

    this.state = {
      updateState: updateStore.state,
    }
  }

  private onUpdateStateChanged = (updateState: IUpdateState) => {
    this.setState({ updateState })

    // If the update is not being downloaded (`UpdateStatus.UpdateAvailable`),
    // i.e. if it's already downloaded or not available, close the window.
    if (updateState.status !== UpdateStatus.UpdateAvailable) {
      sendWillQuitSync()
      closeWindow()
      app.quit()
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

  private renderUpdateAvailable() {
    return (
      <Row className="update-status">
        <Loading />
        <span>
          Installing update… please, do not close GitHub Desktop until the
          update is completely installed.
        </span>
      </Row>
    )
  }

  private renderUpdateReady() {
    return (
      <p className="update-status">
        An update has been downloaded, you can close GitHub Desktop now.
      </p>
    )
  }

  private renderUpdateDetails() {
    const updateState = this.state.updateState

    switch (updateState.status) {
      case UpdateStatus.UpdateAvailable:
        return this.renderUpdateAvailable()
      case UpdateStatus.UpdateReady:
        return this.renderUpdateReady()
      case UpdateStatus.CheckingForUpdates:
      case UpdateStatus.UpdateNotAvailable:
      case UpdateStatus.UpdateNotChecked:
        return null
      default:
        return assertNever(
          updateState.status,
          `Unknown update status ${updateState.status}`
        )
    }
  }

  private onQuitAnywayButtonClicked = () => {
    sendWillQuitEvenUpdatingSync()
    closeWindow()
    app.quit()
  }

  public render() {
    return (
      <Dialog
        id="installing-update"
        onSubmit={this.props.onDismissed}
        dismissable={false}
      >
        <DialogHeader
          title={__DARWIN__ ? 'Installing Update' : 'Installing update'}
          dismissable={false}
        />
        <DialogContent>{this.renderUpdateDetails()}</DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Quit Anyway' : 'Quit anyway'}
            onOkButtonClick={this.onQuitAnywayButtonClicked}
            onCancelButtonClick={this.props.onDismissed}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
