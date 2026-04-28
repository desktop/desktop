import * as React from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DefaultDialogFooter,
} from './dialog'
import { dialogTransitionTimeout } from './app'
import { GitError, isAuthFailureError } from '../lib/git/core'
import { Popup, PopupType } from '../models/popup'
import { OkCancelButtonGroup } from './dialog/ok-cancel-button-group'
import { ErrorWithMetadata } from '../lib/error-with-metadata'
import { RetryActionType, RetryAction } from '../models/retry-actions'
import { Ref } from './lib/ref'
import { GitError as DugiteError } from 'dugite'
import { LinkButton } from './lib/link-button'
import { getFileFromExceedsError } from '../lib/helpers/regex'
import { CopilotError, getCopilotErrorDisplayInfo } from '../lib/copilot-error'
import { Terminal } from './terminal'
import { coerceToString } from '../lib/git/coerce-to-string'

interface IAppErrorProps {
  /** The error to be displayed  */
  readonly error: Error

  /** Called to dismiss the dialog */
  readonly onDismissed: () => void
  readonly onShowPopup: (popupType: Popup) => void | undefined
  readonly onRetryAction: (retryAction: RetryAction) => void
}

interface IAppErrorState {
  /** The currently displayed error or null if no error is shown */
  readonly error: Error | null

  /**
   * Whether or not the dialog and its buttons are disabled.
   * This is used when the dialog is transitioning out of view.
   */
  readonly disabled: boolean
}

/**
 * A component which renders application-wide errors as dialogs. Only one error
 * is shown per dialog and if multiple errors are queued up they will be shown
 * in the order they were queued.
 */
export class AppError extends React.Component<IAppErrorProps, IAppErrorState> {
  private dialogContent: HTMLDivElement | null = null

  public constructor(props: IAppErrorProps) {
    super(props)
    this.state = {
      error: props.error,
      disabled: false,
    }
  }

  public componentWillReceiveProps(nextProps: IAppErrorProps) {
    const error = nextProps.error

    // We keep the currently shown error until it has disappeared
    // from the first spot in the application error queue.
    if (error !== this.state.error) {
      this.setState({ error, disabled: false })
    }
  }

  private showPreferencesDialog = () => {
    this.props.onDismissed()

    //This is a hacky solution to resolve multiple dialog windows
    //being open at the same time.
    window.setTimeout(() => {
      this.props.onShowPopup({ type: PopupType.Preferences })
    }, dialogTransitionTimeout.exit)
  }

  private onRetryAction = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.props.onDismissed()

    const { error } = this.state

    if (error !== null && isErrorWithMetaData(error)) {
      const { retryAction } = error.metadata
      if (retryAction !== undefined) {
        this.props.onRetryAction(retryAction)
      }
    }
  }

  private renderErrorMessage(error: Error) {
    const e = getUnderlyingError(error)

    // If the error message is just the raw git output, display it in
    // fixed-width font
    if (isRawGitError(e)) {
      return <Terminal terminalOutput={e.message} rows={15} cols={80} />
    }

    if (
      isGitError(e) &&
      e.result.gitError === DugiteError.PushWithFileSizeExceedingLimit
    ) {
      const files = getFileFromExceedsError(coerceToString(e.result.stderr))
      return (
        <>
          <p>{error.message}</p>
          {files.length > 0 && (
            <>
              <p>Files that exceed the limit</p>
              <ul>
                {files.map(file => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </>
          )}
          <p>
            See{' '}
            <LinkButton uri="https://gh.io/lfs">https://gh.io/lfs</LinkButton>{' '}
            for more information on managing large files on GitHub
          </p>
        </>
      )
    }

    if (e instanceof CopilotError) {
      const displayInfo = getCopilotErrorDisplayInfo(e)
      if (displayInfo !== null) {
        const { actionText, actionURL, message, retryAfterMessage } =
          displayInfo

        return (
          <>
            <p>{message}</p>
            {retryAfterMessage !== undefined ? (
              <p>{retryAfterMessage}</p>
            ) : null}
            {actionText !== undefined && actionURL !== undefined ? (
              <p>
                <LinkButton uri={actionURL}>{actionText}</LinkButton>
              </p>
            ) : null}
          </>
        )
      }
    }

    return <p>{e.message}</p>
  }

  private getTitle(error: Error) {
    const underlyingError = getUnderlyingError(error)

    if (underlyingError instanceof CopilotError) {
      const displayInfo = getCopilotErrorDisplayInfo(underlyingError)
      if (displayInfo !== null) {
        return displayInfo.title
      }
    }

    switch (getDugiteError(error)) {
      case DugiteError.PushWithFileSizeExceedingLimit:
        return 'File size limit exceeded'
    }

    switch (getRetryActionType(error)) {
      case RetryActionType.Clone:
        return 'Clone failed'
      case RetryActionType.Push:
        return 'Failed to push'
    }

    if (isErrorWithMetaData(error)) {
      const { gitContext } = error.metadata
      switch (gitContext?.kind) {
        case 'create-repository':
          return `Failed creating repository`
        case 'commit':
          return `Commit failed`
      }
    }

    return 'Error'
  }

  private renderContentAfterErrorMessage(error: Error) {
    if (!isErrorWithMetaData(error)) {
      return undefined
    }

    const { retryAction } = error.metadata

    if (retryAction && retryAction.type === RetryActionType.Clone) {
      return (
        <p>
          Would you like to retry cloning <Ref>{retryAction.name}</Ref>?
        </p>
      )
    }

    return undefined
  }

  private onDialogContentRef = (ref: HTMLDivElement | null) => {
    this.dialogContent = ref
  }

  private scrollToBottomOfGitErrorMessage() {
    if (this.dialogContent === null || this.state.error === null) {
      return
    }

    const e = getUnderlyingError(this.state.error)

    if (isRawGitError(e)) {
      this.dialogContent.scrollTop = this.dialogContent.scrollHeight
    }
  }

  public componentDidMount() {
    this.scrollToBottomOfGitErrorMessage()
  }

  public componentDidUpdate(
    prevProps: IAppErrorProps,
    prevState: IAppErrorState
  ) {
    if (prevState.error !== this.state.error) {
      this.scrollToBottomOfGitErrorMessage()
    }
  }

  private onCloseButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    this.props.onDismissed()
  }

  private renderFooter(error: Error) {
    if (isCloneError(error)) {
      return this.renderRetryCloneFooter()
    }

    const underlyingError = getUnderlyingError(error)

    if (isGitError(underlyingError)) {
      const { gitError } = underlyingError.result
      if (gitError !== null && isAuthFailureError(gitError)) {
        return this.renderOpenPreferencesFooter()
      }
    }

    return this.renderDefaultFooter()
  }

  private renderRetryCloneFooter() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={__DARWIN__ ? 'Retry Clone' : 'Retry clone'}
          onOkButtonClick={this.onRetryAction}
          onCancelButtonClick={this.onCloseButtonClick}
        />
      </DialogFooter>
    )
  }

  private renderOpenPreferencesFooter() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText="Close"
          onOkButtonClick={this.onCloseButtonClick}
          cancelButtonText={__DARWIN__ ? 'Open Preferences' : 'Open options'}
          onCancelButtonClick={this.showPreferencesDialog}
        />
      </DialogFooter>
    )
  }

  private renderDefaultFooter() {
    return <DefaultDialogFooter onButtonClick={this.onCloseButtonClick} />
  }

  public render() {
    const error = this.state.error

    if (!error) {
      return null
    }

    return (
      <Dialog
        id="app-error"
        type="error"
        key="error"
        title={this.getTitle(error)}
        backdropDismissable={false}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
        disabled={this.state.disabled}
        className={
          isRawGitError(this.state.error) ? 'raw-git-error' : undefined
        }
        role="alertdialog"
        ariaDescribedBy="app-error-description"
      >
        <DialogContent onRef={this.onDialogContentRef}>
          <div id="app-error-description">
            {this.renderErrorMessage(error)}
            {this.renderContentAfterErrorMessage(error)}
          </div>
        </DialogContent>
        {this.renderFooter(error)}
      </Dialog>
    )
  }
}

function getUnderlyingError(error: Error): Error {
  return isErrorWithMetaData(error) ? error.underlyingError : error
}

function isErrorWithMetaData(error: Error): error is ErrorWithMetadata {
  return error instanceof ErrorWithMetadata
}

function isGitError(error: Error): error is GitError {
  return error instanceof GitError
}

function isRawGitError(error: Error | null) {
  if (!error) {
    return false
  }
  const e = getUnderlyingError(error)
  return e instanceof GitError && e.isRawMessage
}

function isCloneError(error: Error) {
  if (!isErrorWithMetaData(error)) {
    return false
  }
  const { retryAction } = error.metadata
  return retryAction !== undefined && retryAction.type === RetryActionType.Clone
}

function getRetryActionType(error: Error) {
  if (!isErrorWithMetaData(error)) {
    return undefined
  }

  return error.metadata.retryAction?.type
}

function getDugiteError(error: Error) {
  const e = getUnderlyingError(error)
  return isGitError(e) ? e.result.gitError : undefined
}
