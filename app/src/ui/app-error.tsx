import * as React from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DefaultDialogFooter,
} from './dialog'
import {
  dialogTransitionEnterTimeout,
  dialogTransitionLeaveTimeout,
} from './app'
import { GitError } from '../lib/git/core'
import { GitError as GitErrorType } from 'dugite'
import { Popup, PopupType } from '../models/popup'
import { CSSTransitionGroup } from 'react-transition-group'
import { OkCancelButtonGroup } from './dialog/ok-cancel-button-group'
import { ErrorWithMetadata } from '../lib/error-with-metadata'

interface IAppErrorProps {
  /** The list of queued, app-wide, errors  */
  readonly errors: ReadonlyArray<Error>

  /**
   * A callback which is used whenever a particular error
   * has been shown to, and been dismissed by, the user.
   */
  readonly onClearError: (error: Error) => void
  readonly onShowPopup: (popupType: Popup) => void | undefined
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
      error: props.errors[0] || null,
      disabled: false,
    }
  }

  public componentWillReceiveProps(nextProps: IAppErrorProps) {
    const error = nextProps.errors[0] || null

    // We keep the currently shown error until it has disappeared
    // from the first spot in the application error queue.
    if (error !== this.state.error) {
      this.setState({ error, disabled: false })
    }
  }

  private onDismissed = () => {
    const currentError = this.state.error

    if (currentError) {
      this.setState({ error: null, disabled: true })

      // Give some time for the dialog to nicely transition
      // out before we clear the error and, potentially, deal
      // with the next error in the queue.
      window.setTimeout(() => {
        this.props.onClearError(currentError)
      }, dialogTransitionLeaveTimeout)
    }
  }

  private showPreferencesDialog = () => {
    this.onDismissed()

    //This is a hacky solution to resolve multiple dialog windows
    //being open at the same time.
    window.setTimeout(() => {
      this.props.onShowPopup({ type: PopupType.Preferences })
    }, dialogTransitionLeaveTimeout)
  }

  private renderGitErrorFooter(error: GitError) {
    const gitErrorType = error.result.gitError

    switch (gitErrorType) {
      case GitErrorType.HTTPSAuthenticationFailed: {
        return (
          <DialogFooter>
            <OkCancelButtonGroup
              okButtonText="Close"
              onOkButtonClick={this.onCloseButtonClick}
              cancelButtonText={
                __DARWIN__ ? 'Open Preferences' : 'Open options'
              }
              onCancelButtonClick={this.showPreferencesDialog}
            />
          </DialogFooter>
        )
      }
      default:
        return <DefaultDialogFooter onButtonClick={this.onCloseButtonClick} />
    }
  }

  private renderErrorMessage(error: Error) {
    let monospace = false
    const e = error instanceof ErrorWithMetadata ? error.underlyingError : error

    if (e instanceof GitError) {
      // See getResultMessage in core.ts
      // If the error message is the same as stderr or stdout then we know
      // it's output from git and we'll display it in fixed-width font
      if (e.message === e.result.stderr || e.message === e.result.stdout) {
        monospace = true
      }
    }

    const className = monospace ? 'monospace' : undefined

    return <p className={className}>{e.message}</p>
  }

  private renderDialog() {
    const error = this.state.error

    if (!error) {
      return null
    }

    return (
      <Dialog
        id="app-error"
        type="error"
        key="error"
        title="Error"
        dismissable={false}
        onSubmit={this.onDismissed}
        onDismissed={this.onDismissed}
        disabled={this.state.disabled}
      >
        <DialogContent onRef={this.onDialogContentRef}>
          {this.renderErrorMessage(error)}
        </DialogContent>
        {this.renderFooter(error)}
      </Dialog>
    )
  }

  private onDialogContentRef = (ref: HTMLDivElement | null) => {
    this.dialogContent = ref
  }

  private scrollToBottomOfGitErrorMessage() {
    if (!this.dialogContent) {
      return
    }

    const e =
      this.state.error instanceof ErrorWithMetadata
        ? this.state.error.underlyingError
        : this.state.error

    if (e instanceof GitError) {
      if (e.message === e.result.stderr || e.message === e.result.stdout) {
        this.dialogContent.scrollTop = this.dialogContent.scrollHeight
      }
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
    this.onDismissed()
  }

  private renderFooter(error: Error) {
    const e = error instanceof ErrorWithMetadata ? error.underlyingError : error

    if (e instanceof GitError) {
      return this.renderGitErrorFooter(e)
    }

    return <DefaultDialogFooter onButtonClick={this.onCloseButtonClick} />
  }

  public render() {
    return (
      <CSSTransitionGroup
        transitionName="modal"
        component="div"
        transitionEnterTimeout={dialogTransitionEnterTimeout}
        transitionLeaveTimeout={dialogTransitionLeaveTimeout}
      >
        {this.renderDialog()}
      </CSSTransitionGroup>
    )
  }
}
