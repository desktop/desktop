import * as React from 'react'
import { clipboard } from 'electron'

import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogError, DialogContent, DialogFooter } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'
import { LinkButton } from '../lib/link-button'
import { updateStore, IUpdateState, UpdateStatus } from '../lib/update-store'
import { Disposable } from 'event-kit'
import { Loading } from '../lib/loading'
import { RelativeTime } from '../relative-time'
import { assertNever } from '../../lib/fatal-error'
import { ReleaseNotesUri } from '../lib/releases'

interface IAboutProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void

  /**
   * The name of the currently installed (and running) application
   */
  readonly applicationName: string

  /**
   * The currently installed (and running) version of the app.
   */
  readonly applicationVersion: string

  /** A function to call to kick off an update check. */
  readonly onCheckForUpdates: () => void

  readonly onShowAcknowledgements: () => void

  /** A function to call when the user wants to see Terms and Conditions. */
  readonly onShowTermsAndConditions: () => void
}

interface IAboutState {
  readonly updateState: IUpdateState
}

/**
 * A dialog that presents information about the
 * running application such as name and version.
 */
export class About extends React.Component<IAboutProps, IAboutState> {
  private closeButton: Button | null = null
  private updateStoreEventHandle: Disposable | null = null

  public constructor(props: IAboutProps) {
    super(props)

    this.state = {
      updateState: updateStore.state,
    }
  }

  private onCloseButtonRef = (button: Button | null) => {
    this.closeButton = button
  }

  private onUpdateStateChanged = (updateState: IUpdateState) => {
    this.setState({ updateState })
  }

  private onClickVersion = () => {
    clipboard.writeText(this.props.applicationVersion)
  }

  public componentDidMount() {
    this.updateStoreEventHandle = updateStore.onDidChange(
      this.onUpdateStateChanged
    )
    this.setState({ updateState: updateStore.state })

    // A modal dialog autofocuses the first element that can receive
    // focus (and our dialog even uses the autofocus attribute on its
    // fieldset). In our case that's the release notes link button and
    // we don't want that to have focus so we'll move it over to the
    // close button instead.
    if (this.closeButton) {
      this.closeButton.focus()
    }
  }

  public componentWillUnmount() {
    if (this.updateStoreEventHandle) {
      this.updateStoreEventHandle.dispose()
      this.updateStoreEventHandle = null
    }
  }

  private onQuitAndInstall = () => {
    updateStore.quitAndInstallUpdate()
  }

  private renderUpdateButton() {
    if (
      __RELEASE_CHANNEL__ === 'development' ||
      __RELEASE_CHANNEL__ === 'test'
    ) {
      return null
    }

    const updateStatus = this.state.updateState.status

    switch (updateStatus) {
      case UpdateStatus.UpdateReady:
        return (
          <Row>
            <Button onClick={this.onQuitAndInstall}>
              Quit and Install Update
            </Button>
          </Row>
        )
      case UpdateStatus.UpdateNotAvailable:
      case UpdateStatus.CheckingForUpdates:
      case UpdateStatus.UpdateAvailable:
        const disabled = updateStatus !== UpdateStatus.UpdateNotAvailable

        return (
          <Row>
            <Button disabled={disabled} onClick={this.props.onCheckForUpdates}>
              Check for Updates
            </Button>
          </Row>
        )
      default:
        return assertNever(
          updateStatus,
          `Unknown update status ${updateStatus}`
        )
    }
  }

  private renderCheckingForUpdate() {
    return (
      <Row className="update-status">
        <Loading />
        <span>Checking for updates…</span>
      </Row>
    )
  }

  private renderUpdateAvailable() {
    return (
      <Row className="update-status">
        <Loading />
        <span>Downloading update…</span>
      </Row>
    )
  }

  private renderUpdateNotAvailable() {
    const lastCheckedDate = this.state.updateState.lastSuccessfulCheck

    // This case is rendered as an error
    if (!lastCheckedDate) {
      return null
    }

    return (
      <p className="update-status">
        You have the latest version (last checked{' '}
        <RelativeTime date={lastCheckedDate} />)
      </p>
    )
  }

  private renderUpdateReady() {
    return (
      <p className="update-status">
        An update has been downloaded and is ready to be installed.
      </p>
    )
  }

  private renderUpdateDetails() {
    if (__LINUX__) {
      return null
    }

    if (
      __RELEASE_CHANNEL__ === 'development' ||
      __RELEASE_CHANNEL__ === 'test'
    ) {
      return (
        <p>
          The application is currently running in development or test mode and
          will not receive any updates.
        </p>
      )
    }

    const updateState = this.state.updateState

    switch (updateState.status) {
      case UpdateStatus.CheckingForUpdates:
        return this.renderCheckingForUpdate()
      case UpdateStatus.UpdateAvailable:
        return this.renderUpdateAvailable()
      case UpdateStatus.UpdateNotAvailable:
        return this.renderUpdateNotAvailable()
      case UpdateStatus.UpdateReady:
        return this.renderUpdateReady()
      default:
        return assertNever(
          updateState.status,
          `Unknown update status ${updateState.status}`
        )
    }
  }

  private renderUpdateErrors() {
    if (__LINUX__) {
      return null
    }

    if (
      __RELEASE_CHANNEL__ === 'development' ||
      __RELEASE_CHANNEL__ === 'test'
    ) {
      return null
    }

    if (!this.state.updateState.lastSuccessfulCheck) {
      return (
        <DialogError>
          Couldn't determine the last time an update check was performed. You
          may be running an old version. Please try manually checking for
          updates and contact GitHub Support if the problem persists
        </DialogError>
      )
    }

    return null
  }

  public render() {
    const name = this.props.applicationName
    const version = this.props.applicationVersion
    const releaseNotesLink = (
      <LinkButton uri={ReleaseNotesUri}>release notes</LinkButton>
    )

    const versionText = __DEV__ ? `Build ${version}` : `Version ${version}`

    return (
      <Dialog
        id="about"
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        {this.renderUpdateErrors()}
        <DialogContent>
          <Row className="logo">
            <Octicon symbol={OcticonSymbol.markGithub} />
          </Row>
          <h2>{name}</h2>
          <p className="no-padding">
            <LinkButton
              title="Click to copy"
              className="version-text"
              onClick={this.onClickVersion}
            >
              {versionText}
            </LinkButton>{' '}
            ({releaseNotesLink})
          </p>
          <p className="no-padding">
            <LinkButton onClick={this.props.onShowTermsAndConditions}>
              Terms and Conditions
            </LinkButton>
          </p>
          <p>
            <LinkButton onClick={this.props.onShowAcknowledgements}>
              License and Open Source Notices
            </LinkButton>
          </p>
          {this.renderUpdateDetails()}
          {this.renderUpdateButton()}
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button
              ref={this.onCloseButtonRef}
              onClick={this.props.onDismissed}
            >
              Close
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
