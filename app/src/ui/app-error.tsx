import * as React from 'react'

import { Button } from './lib/button'
import { ButtonGroup } from './lib/button-group'
import { Dialog, DialogContent, DialogFooter } from './dialog'
import {
  dialogTransitionEnterTimeout,
  dialogTransitionLeaveTimeout,
} from './app'
import { GitError } from '../lib/git/core'
import { GitError as GitErrorType } from 'dugite'
import { Popup, PopupType } from '../models/popup'
import { CSSTransitionGroup } from 'react-transition-group'

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
          <ButtonGroup>
            <Button type="submit" onClick={this.onCloseButtonClick}>
              Close
            </Button>
            <Button onClick={this.showPreferencesDialog}>
              {__DARWIN__ ? 'Open Preferences' : 'Open options'}
            </Button>
          </ButtonGroup>
        )
      }
      default:
        return (
          <ButtonGroup>
            <Button type="submit" onClick={this.onCloseButtonClick}>
              Close
            </Button>
          </ButtonGroup>
        )
    }
  }

  private renderErrorMessage(error: Error) {
    let monospace = false

    if (error instanceof GitError) {
      // See getResultMessage in core.ts
      // If the error message is the same as stderr or stdout then we know
      // it's output from git and we'll display it in fixed-width font
      if (
        error.message === error.result.stderr ||
        error.message === error.result.stdout
      ) {
        monospace = true
      }
    }

    const className = monospace ? 'monospace' : undefined

    return <p className={className}>{error.message}</p>
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
        onDismissed={this.onDismissed}
        disabled={this.state.disabled}
      >
        <DialogContent>{this.renderErrorMessage(error)}</DialogContent>
        <DialogFooter>{this.renderFooter(error)}</DialogFooter>
      </Dialog>
    )
  }

  private onCloseButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    this.onDismissed()
  }

  private renderFooter(error: Error) {
    if (error instanceof GitError) {
      return this.renderGitErrorFooter(error)
    }

    return (
      <ButtonGroup>
        <Button type="submit" onClick={this.onCloseButtonClick}>
          Close
        </Button>
      </ButtonGroup>
    )
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
