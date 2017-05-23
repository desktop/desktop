import * as React from 'react'

import { Button } from './lib/button'
import { ButtonGroup } from './lib/button-group'
import { Dialog, DialogContent, DialogFooter } from './dialog'
import { LinkButton } from './lib/link-button'
import { dialogTransitionEnterTimeout, dialogTransitionLeaveTimeout } from './app'
import { GitError } from '../lib/git/core'
import { GitError as GitErrorType } from 'dugite'
import { Popup, PopupType } from '../lib/app-state'
import { ErrorWithMetadata } from '../lib/error-with-metadata'
import { remote } from 'electron'
import { CSSTransitionGroup } from 'react-transition-group'

/**
 * Inspect the error metadata to see if this is an uncaught error
 */
function isUncaughtError(error: Error): boolean {
  if (error instanceof ErrorWithMetadata) {
    return error.metadata.uncaught || false
  } else {
    return false
  }
}

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
      setTimeout(() => {
        this.props.onClearError(currentError)
      }, dialogTransitionLeaveTimeout)
    }
  }

  private showPreferencesDialog = () => {
    this.onDismissed()

    //This is a hacky solution to resolve multiple dialog windows
    //being open at the same time.
    setTimeout(() => {
      this.props.onShowPopup({ type: PopupType.Preferences })
    }, dialogTransitionLeaveTimeout)
  }

  private closeAndExit = () => {
    this.onDismissed()

    // this gives a brief pause between dismissing the dialog and
    // exiting the app completely - choosing 500ms but it can be
    // relative to some other value
    setTimeout(() => {
      remote.app.exit()
    }, 5 * dialogTransitionLeaveTimeout)
  }

  private renderGitErrorFooter(error: GitError) {
    const gitErrorType = error.result.gitError

    switch (gitErrorType)  {
      case GitErrorType.HTTPSAuthenticationFailed: {
        return (
          <ButtonGroup>
            <Button type='submit'>Close</Button>
            <Button onClick={this.showPreferencesDialog}>
              {__DARWIN__ ? 'Open Preferences' : 'Open options'}
            </Button>
          </ButtonGroup>)
      }
      default:
        return (
          <ButtonGroup>
            <Button type='submit'>Close</Button>
          </ButtonGroup>)
    }
  }

  private renderErrorMessage(error: Error, unhandled: boolean) {
    if (unhandled) {
      const errorDetails = error.stack
        ? <p className='monospace'>{error.stack}</p>
        : <p>{error.message}</p>

      return (
        <div>
          <p>GitHub Desktop encountered an uncaught exception, leaving it in an invalid state.</p>
          <p>
            This has been reported to the team, but if you encounter this repeatedly please report this issue to the GitHub Desktop <LinkButton uri='https://github.com/desktop/desktop/issues'>issue tracker</LinkButton>.
          </p>
          {errorDetails}
          <p>Due to this error, the application will now quit and will need to be restarted.</p>
        </div>
      )
    }

    let monospace = false

    if (error instanceof GitError) {
      // See getResultMessage in core.ts
      // If the error message is the same as stderr or stdout then we know
      // it's output from git and we'll display it in fixed-width font
      if (error.message === error.result.stderr || error.message === error.result.stdout) {
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

    const unhandled = isUncaughtError(error)
    const title = unhandled ? 'Unhandled Exception' : 'Error'

    return (
      <Dialog
        id='app-error'
        type='error'
        key='error'
        title={title}
        dismissable={!unhandled}
        onDismissed={this.onDismissed}
        disabled={this.state.disabled}>
        <DialogContent>
          {this.renderErrorMessage(error, unhandled)}
        </DialogContent>
        <DialogFooter>
          {this.renderFooter(error, unhandled)}
        </DialogFooter>
      </Dialog>
    )
  }

  private renderFooter(error: Error, unhandled: boolean) {
    if (unhandled) {
      return (
        <ButtonGroup>
          <Button onClick={this.closeAndExit} type='submit'>Quit</Button>
        </ButtonGroup>
      )
    }

    if (error instanceof GitError) {
      return this.renderGitErrorFooter(error)
    }

    return (
      <ButtonGroup>
        <Button type='submit'>Close</Button>
      </ButtonGroup>)
  }

  public render() {
    return (
      <CSSTransitionGroup
        transitionName='modal'
        component='div'
        transitionEnterTimeout={dialogTransitionEnterTimeout}
        transitionLeaveTimeout={dialogTransitionLeaveTimeout}
      >
        {this.renderDialog()}
      </CSSTransitionGroup>
    )
  }
}
